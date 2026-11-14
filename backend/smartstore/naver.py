"""네이버 커머스API 호출 (v2 STORE). 조회만 한다 — 주문 상태를 바꾸는 API 는 부르지 않는다.

- 인증: 내스토어 애플리케이션(type=SELF). client_secret_sign = base64(bcrypt(`{client_id}_{timestamp}`, 시크릿))
- 키는 settings.NAVER_COMMERCE_KEY_FILE 이 가리키는 파일(또는 환경 변수)에서 읽고, 화면 · DB · 로그에 남기지 않는다
- 토큰(3시간)은 메모리 캐시에 두고 만료 1분 전에 새로 받는다
확인한 응답 모양은 docs/api.md "스마트스토어 연동" 참고 (2026-11-14 실제 조회로 확인)
"""

import base64
import datetime as dt
import os
import time
from pathlib import Path

import bcrypt
import requests
from django.conf import settings
from django.core.cache import cache

BASE = 'https://api.commerce.naver.com/external'
KST = dt.timezone(dt.timedelta(hours=9))
TOKEN_CACHE = 'smartstore-token'
TIMEOUT = 20
GAP = 0.5  # 연달아 부를 때 사이 간격 (초) — 너무 빨리 부르면 429
DETAIL_MAX = 300  # 상품 주문 상세 조회 한 번에 넣을 수 있는 상품주문번호 수


class NoKey(Exception):
    """키가 설정되지 않음 (연결 안 됨)"""


class NaverError(Exception):
    """네이버가 오류로 답함 · 응답 없음 (연결 실패)"""


def read_keys():
    """(client_id, secret). 환경 변수가 먼저, 없으면 키 파일. 둘 다 없으면 NoKey"""
    cid = os.environ.get('NAVER_COMMERCE_CLIENT_ID', '').strip()
    secret = os.environ.get('NAVER_COMMERCE_CLIENT_SECRET', '').strip()
    if cid and secret:
        return cid, secret
    path = getattr(settings, 'NAVER_COMMERCE_KEY_FILE', '')
    if not path or not Path(path).is_file():
        raise NoKey('키가 없습니다')
    values = {}
    for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            values[k.strip().removeprefix('export ').strip()] = v.strip().strip('"').strip("'")
    cid = values.get('NAVER_CLIENT_ID') or values.get('NAVER_COMMERCE_CLIENT_ID')
    secret = values.get('NAVER_CLIENT_SECRET') or values.get('NAVER_COMMERCE_CLIENT_SECRET')
    if not cid or not secret:
        raise NoKey('키 파일에 ID · 시크릿이 없습니다')
    return cid, secret


def token(fresh=False):
    """접근 토큰 (메모리 캐시, 만료 1분 전까지). fresh 면 새로 받는다"""
    if not fresh and (token := cache.get(TOKEN_CACHE)):
        return token
    cid, secret = read_keys()
    ts = str(int((time.time() - 3) * 1000))  # 네이버 서버 시각보다 조금 앞서지 않게
    try:
        sign = base64.b64encode(bcrypt.hashpw(f'{cid}_{ts}'.encode(), secret.encode())).decode()
    except ValueError as e:  # 시크릿이 bcrypt 솔트 모양이 아님
        raise NaverError('애플리케이션 시크릿 형식이 맞지 않습니다') from e
    body = {
        'client_id': cid,
        'timestamp': ts,
        'client_secret_sign': sign,
        'grant_type': 'client_credentials',
        'type': 'SELF',
    }
    try:
        res = requests.post(f'{BASE}/v1/oauth2/token', data=body, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise NaverError('네이버에 연결하지 못했습니다') from e
    if res.status_code != 200:
        raise NaverError(_message(res, '토큰을 받지 못했습니다'))
    data = res.json()
    cache.set(TOKEN_CACHE, data['access_token'], max(60, int(data.get('expires_in', 3600)) - 60))
    return data['access_token']


def _message(res, default):
    try:
        body = res.json()
    except ValueError:
        return f'{default} ({res.status_code})'
    return f'{default} ({res.status_code} {body.get("code", "")} {body.get("message", "")})'.strip()


def call(method, path, **kw):
    """API 한 번. 토큰이 만료됐으면(401) 새로 받아 한 번 더, 429 면 잠깐 쉬고 다시 → 응답 JSON"""
    fresh = False
    for attempt in range(4):
        try:
            res = requests.request(
                method, f'{BASE}{path}', headers={'Authorization': f'Bearer {token(fresh)}'}, timeout=TIMEOUT, **kw
            )
        except requests.RequestException as e:
            raise NaverError('네이버에 연결하지 못했습니다') from e
        if res.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue
        if res.status_code == 401 and not fresh:
            fresh = True
            continue
        break
    time.sleep(GAP)
    if res.status_code != 200:
        raise NaverError(_message(res, '주문을 가져오지 못했습니다'))
    return res.json()


def check():
    """연결 확인: 토큰을 새로 받아 본다. 키가 없으면 NoKey, 틀리면 NaverError"""
    token(fresh=True)


def iso(t):
    return t.astimezone(KST).isoformat(timespec='milliseconds')


def changed_product_orders(start, end):
    """[start, end) 사이에 바뀐(결제 · 배송 · 취소 · 반품 · 구매확정 …) 상품주문번호 목록.
    변경 상품 주문 내역 API 는 24시간씩 묻고, 한 번에 다 못 주면 more(moreFrom · moreSequence)로 이어서"""
    ids = []
    t = start
    while t < end:
        to = min(t + dt.timedelta(hours=24), end)
        params = {'lastChangedFrom': iso(t), 'lastChangedTo': iso(to)}
        while True:
            data = call('GET', '/v1/pay-order/seller/product-orders/last-changed-statuses', params=params).get('data')
            data = data or {}
            ids += [x['productOrderId'] for x in data.get('lastChangeStatuses') or [] if x.get('productOrderId')]
            more = data.get('more')
            if not more or not more.get('moreSequence'):
                break
            params = {
                **params,
                'lastChangedFrom': more.get('moreFrom', params['lastChangedFrom']),
                'moreSequence': more['moreSequence'],
            }
        t = to
    return list(dict.fromkeys(ids))


def product_orders(ids):
    """상품주문번호들의 상세 → [{order, productOrder, …}] (300개씩)"""
    out = []
    for i in range(0, len(ids), DETAIL_MAX):
        out += (
            call(
                'POST', '/v1/pay-order/seller/product-orders/query', json={'productOrderIds': ids[i : i + DETAIL_MAX]}
            ).get('data')
            or []
        )
    return out
