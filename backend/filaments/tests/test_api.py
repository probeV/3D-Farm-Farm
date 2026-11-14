import os
from datetime import date
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from ..models import Brand, Color, Filament, Material, Spool
from .utils import TempMediaMixin, image_size, make_image

API = '/api/v0'


class ApiTestCase(APITestCase):
    def setUp(self):
        self.brand = Brand.objects.create(name='Bambu Lab')
        self.material = Material.objects.create(name='PLA')
        self.filament = Filament.objects.create(
            brand=self.brand, material=self.material, series='Basic', price=Decimal('20000')
        )
        self.color = Color.objects.create(filament=self.filament, name='화이트', hex='#FFFFFF')


class BrandApiTests(ApiTestCase):
    def test_list_with_filament_count(self):
        Brand.objects.create(name='Esun')
        res = self.client.get(f'{API}/brands/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            [(b['name'], b['filament_count']) for b in res.data],
            [('Bambu Lab', 1), ('Esun', 0)],
        )

    def test_create_and_duplicate_name(self):
        self.assertEqual(self.client.post(f'{API}/brands/', {'name': 'Esun'}).status_code, 201)
        res = self.client.post(f'{API}/brands/', {'name': 'Esun'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['name'], ['이미 있는 회사 이름입니다.'])

    def test_delete_with_filament_is_conflict(self):
        res = self.client.delete(f'{API}/brands/{self.brand.pk}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['detail'], '필라멘트가 있어서 삭제할 수 없습니다.')

    def test_delete_empty_brand(self):
        esun = Brand.objects.create(name='Esun')
        self.assertEqual(self.client.delete(f'{API}/brands/{esun.pk}/').status_code, 204)

    def test_put_not_allowed(self):
        self.assertEqual(self.client.put(f'{API}/brands/{self.brand.pk}/', {'name': 'X'}).status_code, 405)


class BrandLogoApiTests(TempMediaMixin, APITestCase):
    def test_create_with_logo(self):
        res = self.client.post(f'{API}/brands/', {'name': 'Esun', 'logo': make_image()}, format='multipart')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['logo'].startswith('/media/brands/'))
        self.assertEqual(image_size(Brand.objects.get(name='Esun').logo), (256, 128))

    def test_replace_logo_deletes_old_file(self):
        brand = Brand.objects.create(name='Esun', logo=make_image('old.png'))
        old_path = brand.logo.path
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(f'{API}/brands/{brand.pk}/', {'logo': make_image('new.png')}, format='multipart')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(os.path.exists(old_path))

    def test_clear_logo_with_null(self):
        brand = Brand.objects.create(name='Esun', logo=make_image())
        path = brand.logo.path
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.patch(f'{API}/brands/{brand.pk}/', {'logo': None}, format='json')
        self.assertIsNone(res.data['logo'])
        self.assertFalse(os.path.exists(path))

    def test_rename_keeps_logo(self):
        brand = Brand.objects.create(name='Esun', logo=make_image())
        res = self.client.patch(f'{API}/brands/{brand.pk}/', {'name': 'eSUN'}, format='json')
        self.assertEqual(res.data['logo'], brand.logo.url)

    def test_gif_is_rejected(self):
        res = self.client.post(
            f'{API}/brands/', {'name': 'Esun', 'logo': make_image('logo.gif', image_format='GIF')}, format='multipart'
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['logo'], ['png, jpg, webp 이미지만 올릴 수 있습니다.'])


class MaterialApiTests(ApiTestCase):
    def test_list_and_create(self):
        self.assertEqual(self.client.post(f'{API}/materials/', {'name': 'PETG'}).status_code, 201)
        res = self.client.get(f'{API}/materials/')
        self.assertEqual([(m['name'], m['filament_count']) for m in res.data], [('PETG', 0), ('PLA', 1)])

    def test_delete_in_use_is_conflict(self):
        res = self.client.delete(f'{API}/materials/{self.material.pk}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['detail'], '필라멘트에서 쓰고 있어서 삭제할 수 없습니다.')


class FilamentApiTests(ApiTestCase):
    def test_list_has_colors_counts_and_average_price(self):
        Spool.objects.create(color=self.color, price=Decimal('18000'))
        Spool.objects.create(color=self.color, price=Decimal('22000'), status=Spool.Status.OPEN)
        Spool.objects.create(color=self.color, price=Decimal('99000'), status=Spool.Status.EMPTY)

        res = self.client.get(f'{API}/filaments/')
        self.assertEqual(res.status_code, 200)
        filament = res.data[0]
        self.assertEqual(filament['display_name'], 'Bambu Lab › PLA Basic')
        self.assertEqual((filament['brand_name'], filament['material_name']), ('Bambu Lab', 'PLA'))
        # 보유(재고 + 사용 중)만 평균: (18000 + 22000) / 2
        self.assertEqual(filament['avg_held_price'], 20000)
        color = filament['colors'][0]
        self.assertEqual(color['counts'], {'sealed': 1, 'open': 1, 'empty': 1})
        self.assertEqual((color['spool_price'], color['price_per_g']), (20000, 20.0))

    def test_whole_numbers_are_integers(self):
        # 금액 · 무게는 14400.0 이 아니라 14400 (JSON 에서 소수점 없이)
        self.filament.spool_g = Decimal('1000.5')
        self.filament.save()
        res = self.client.get(f'{API}/filaments/{self.filament.pk}/')
        self.assertIs(type(res.data['price']), int)
        self.assertIs(type(res.data['colors'][0]['spool_price']), int)
        self.assertEqual(res.data['spool_g'], 1000.5)
        self.assertIn('"price":20000,', res.content.decode())

    def test_list_is_sorted_by_brand_material_series(self):
        # 나중에 만들었어도 회사 이름순으로 앞에 온다
        Filament.objects.create(brand=Brand.objects.create(name='Anycubic'), material=self.material)
        res = self.client.get(f'{API}/filaments/')
        self.assertEqual([f['display_name'] for f in res.data], ['Anycubic › PLA', 'Bambu Lab › PLA Basic'])

    def test_average_price_is_none_without_held_spools(self):
        res = self.client.get(f'{API}/filaments/{self.filament.pk}/')
        self.assertIsNone(res.data['avg_held_price'])

    def test_create_without_series(self):
        res = self.client.post(f'{API}/filaments/', {'brand': self.brand.pk, 'material': self.material.pk})
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['display_name'], res.data['spool_g']), ('Bambu Lab › PLA', 1000))

    def test_duplicate_is_rejected(self):
        res = self.client.post(
            f'{API}/filaments/', {'brand': self.brand.pk, 'material': self.material.pk, 'series': 'Basic'}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['series'], ['같은 회사·재질·시리즈의 필라멘트가 이미 있습니다.'])

    def test_delete_with_colors_is_conflict(self):
        self.assertEqual(self.client.delete(f'{API}/filaments/{self.filament.pk}/').status_code, 409)


class QueryCountTests(ApiTestCase):
    """색상이 늘어나도 쿼리 수가 늘지 않는지 (N+1 없음). 계산값은 뷰의 queryset 이 한 번에 붙인다"""

    def add_colors(self, count):
        for i in range(count):
            color = Color.objects.create(filament=self.filament, name=f'색{i}', hex='#123456')
            Spool.objects.create(color=color, price=Decimal('15000'))

    def count_queries(self, method, url, data=None):
        with CaptureQueriesContext(connection) as queries:
            res = getattr(self.client, method)(url, data, format='json')
        self.assertLess(res.status_code, 300)
        return len(queries)

    def test_filament_list_and_patch_do_not_grow_with_colors(self):
        url = f'{API}/filaments/{self.filament.pk}/'
        before = (self.count_queries('get', f'{API}/filaments/'), self.count_queries('patch', url, {'price': 15000}))
        self.add_colors(5)
        after = (self.count_queries('get', f'{API}/filaments/'), self.count_queries('patch', url, {'price': 16000}))
        self.assertEqual(before, after)

    def test_patch_response_has_counts_and_average(self):
        self.add_colors(2)
        res = self.client.patch(f'{API}/filaments/{self.filament.pk}/', {'price': 16000}, format='json')
        self.assertEqual(res.data['avg_held_price'], 15000)
        self.assertEqual(res.data['colors'][1]['counts'], {'sealed': 1, 'open': 0, 'empty': 0})

    def test_create_responses_have_computed_fields(self):
        res = self.client.post(f'{API}/brands/', {'name': 'Esun'}, format='json')
        self.assertEqual(res.data['filament_count'], 0)
        res = self.client.post(f'{API}/filaments/', {'brand': res.data['id'], 'material': self.material.pk})
        self.assertIsNone(res.data['avg_held_price'])
        self.assertEqual(res.data['colors'], [])


class ColorApiTests(ApiTestCase):
    def test_create_normalizes_hex(self):
        res = self.client.post(f'{API}/colors/', {'filament': self.filament.pk, 'name': '블랙', 'hex': '1a1a1a'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['hex'], '#1A1A1A')
        self.assertEqual(res.data['counts'], {'sealed': 0, 'open': 0, 'empty': 0})

    def test_bad_hex_and_duplicate_name(self):
        res = self.client.post(f'{API}/colors/', {'filament': self.filament.pk, 'name': '화이트', 'hex': 'FFF'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('hex', res.data)
        res = self.client.post(f'{API}/colors/', {'filament': self.filament.pk, 'name': '화이트', 'hex': 'FFFFFF'})
        self.assertEqual(res.data['name'], ['이 필라멘트에 같은 이름의 색상이 이미 있습니다.'])

    def test_rename_to_itself_is_fine(self):
        res = self.client.patch(f'{API}/colors/{self.color.pk}/', {'name': '화이트', 'price': 15000})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['spool_price'], 15000)

    def test_delete_with_spools_deletes_spools(self):
        Spool.objects.create(color=self.color)
        Spool.objects.create(color=self.color, status=Spool.Status.EMPTY)
        self.assertEqual(self.client.delete(f'{API}/colors/{self.color.pk}/').status_code, 204)
        self.assertFalse(Spool.objects.filter(color_id=self.color.pk).exists())


class PurchaseApiTests(ApiTestCase):
    def purchase(self, **data):
        return self.client.post(f'{API}/colors/{self.color.pk}/spools/', data, format='json')

    def test_auto_numbers_and_default_price(self):
        Spool.objects.create(color=self.color, code_no=40)
        res = self.purchase(quantity=3, purchased_at='2026-10-20')
        self.assertEqual(res.status_code, 201)
        self.assertEqual([s['code'] for s in res.data], ['S00041', 'S00042', 'S00043'])
        self.assertEqual({s['price'] for s in res.data}, {20000})
        self.assertEqual({s['status'] for s in res.data}, {'sealed'})

    def test_price_and_date(self):
        res = self.purchase(quantity=2, price=18000)
        self.assertEqual(res.data[0]['price'], 18000)
        self.assertEqual(res.data[0]['purchased_at'], date.today().isoformat())
        self.assertEqual(res.data[0]['buy'], None)

    def test_deleted_number_not_reused(self):
        """번호는 항상 다음 번호부터 — 맨 끝 스풀을 지워도 그 번호는 다시 안 씀 (TBD-33). 보낸 code_nos 는 무시"""
        for n in (10, 11, 50):
            Spool.objects.create(color=self.color, code_no=n)
        Spool.objects.get(code_no=50).delete()
        res = self.purchase(quantity=2, code_nos=[11])
        self.assertEqual([s['code'] for s in res.data], ['S00051', 'S00052'])

    def test_quantity_limits(self):
        self.assertEqual(self.purchase(quantity=0).status_code, 400)
        self.assertEqual(self.purchase(quantity=101).status_code, 400)


class SpoolApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.spool = Spool.objects.create(color=self.color, code_no=12)

    def test_list_filters(self):
        Spool.objects.create(color=self.color, status=Spool.Status.OPEN)
        other = Color.objects.create(filament=self.filament, name='블랙', hex='#000000')
        Spool.objects.create(color=other)
        res = self.client.get(f'{API}/spools/', {'color': self.color.pk, 'status': 'sealed'})
        self.assertEqual([s['code'] for s in res.data], ['S00012'])

    def test_status_only_applies_date_rules(self):
        res = self.client.patch(f'{API}/spools/{self.spool.pk}/', {'status': 'open'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data['opened_at'])
        self.assertIsNone(res.data['finished_at'])

    def test_status_with_dates_keeps_given_dates(self):
        # 되돌리기: 이전 상태와 날짜를 같이 보내면 그대로 저장
        self.spool.set_status('open')
        self.spool.save()
        res = self.client.patch(
            f'{API}/spools/{self.spool.pk}/',
            {'status': 'sealed', 'opened_at': None, 'finished_at': None},
            format='json',
        )
        self.assertEqual((res.data['status'], res.data['opened_at']), ('sealed', None))

    def test_code_no_cannot_change(self):
        res = self.client.patch(f'{API}/spools/{self.spool.pk}/', {'code_no': 99}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code_no'], ['스풀 번호는 바꿀 수 없습니다.'])

    def test_recreate_deleted_spool_with_same_number(self):
        data = self.client.get(f'{API}/spools/{self.spool.pk}/').data
        self.assertEqual(self.client.delete(f'{API}/spools/{self.spool.pk}/').status_code, 204)
        res = self.client.post(f'{API}/spools/', {k: v for k, v in data.items() if k != 'id'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['code'], 'S00012')

    def test_create_with_used_number_is_rejected(self):
        res = self.client.post(f'{API}/spools/', {'color': self.color.pk, 'code_no': 12}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['code_no'], ['S00012 는 이미 있습니다.'])

    def test_bulk_delete(self):
        extra = Spool.objects.create(color=self.color)
        res = self.client.delete(f'{API}/spools/?ids={self.spool.pk},{extra.pk}')
        self.assertEqual(res.data, {'deleted': 2})
        self.assertFalse(Spool.objects.exists())

    def test_bulk_delete_bad_ids(self):
        for query, message in [
            ('', '이 필드는 필수 항목입니다.'),
            ('?ids=3,abc', '스풀 id 를 쉼표로 구분해 주세요. (예: 3,4,5)'),
            ('?ids=' + ','.join(str(n) for n in range(1, 102)), '한 번에 100개까지 삭제할 수 있습니다.'),
        ]:
            with self.subTest(query=query[:20]):
                res = self.client.delete(f'{API}/spools/{query}')
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.data['ids'], [message])
        self.assertTrue(Spool.objects.exists())

    def test_delete_on_list_only_for_spools(self):
        # 목록 주소의 DELETE 는 bulk_destroy 가 있는 스풀에만
        self.assertEqual(self.client.delete(f'{API}/colors/?ids=1').status_code, 405)

    def test_find_by_code(self):
        res = self.client.get(f'{API}/spools/code/s00012/')
        self.assertEqual((res.status_code, res.data['id']), (200, self.spool.pk))
        self.assertEqual(self.client.get(f'{API}/spools/code/S00099/').status_code, 404)
        res = self.client.get(f'{API}/spools/code/abc/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('code', res.data)

    def test_bad_query_params_are_rejected(self):
        res = self.client.get(f'{API}/spools/', {'color': 'abc'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('color', res.data)
        res = self.client.get(f'{API}/spools/', {'status': 'lost'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('status', res.data)

    def test_query_params_only_apply_to_list(self):
        # 상세 · 수정에는 목록용 쿼리가 끼어들지 않는다
        res = self.client.get(f'{API}/spools/{self.spool.pk}/', {'color': 'abc'})
        self.assertEqual(res.status_code, 200)

    def test_non_numeric_id_is_json_not_found(self):
        for method, url in [
            ('get', f'{API}/spools/abc/'),
            ('get', f'{API}/brands/abc/'),
            ('patch', f'{API}/colors/abc/'),
            ('patch', f'{API}/filaments/abc/'),
            ('post', f'{API}/colors/abc/spools/'),
        ]:
            with self.subTest(url=url):
                res = getattr(self.client, method)(url)
                self.assertEqual(res.status_code, 404)
                self.assertEqual(res['Content-Type'], 'application/json')

    def test_not_found_message_is_korean(self):
        for url in [f'{API}/spools/999/', f'{API}/spools/abc/', f'{API}/spools/code/S00999/']:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).data, {'detail': '찾을 수 없습니다.'})


class LabelApiTests(ApiTestCase):
    """QR 라벨 (v2 TBD-18): 라벨 뽑음 표시 · QR 주소 앞부분 · 폰 스풀 화면"""

    def setUp(self):
        super().setUp()
        self.spools = [Spool.objects.create(color=self.color) for _ in range(3)]

    def test_new_spool_has_no_label(self):
        res = self.client.get(f'{API}/spools/')
        self.assertEqual({s['label_printed'] for s in res.data}, {False})

    def test_mark_printed_and_undo(self):
        ids = [s.pk for s in self.spools[:2]]
        res = self.client.post(f'{API}/spools/labels/', {'ids': ids}, format='json')
        self.assertEqual(res.data, {'updated': 2})
        self.assertEqual(list(Spool.objects.filter(label_printed=True).values_list('pk', flat=True)), ids)
        res = self.client.post(f'{API}/spools/labels/', {'ids': ids, 'printed': False}, format='json')
        self.assertEqual(res.data, {'updated': 2})
        self.assertFalse(Spool.objects.filter(label_printed=True).exists())

    def test_mark_printed_bad_input(self):
        for body in [{}, {'ids': []}, {'ids': ['abc']}, {'ids': list(range(1, 502))}]:
            with self.subTest(body=str(body)[:30]):
                res = self.client.post(f'{API}/spools/labels/', body, format='json')
                self.assertEqual(res.status_code, 400)
                self.assertIn('ids', res.data)

    def test_public_url(self):
        with self.settings(PUBLIC_URL='http://192.168.0.10:5173'):
            self.assertEqual(self.client.get(f'{API}/spools/labels/').data, {'public_url': 'http://192.168.0.10:5173'})
        with self.settings(PUBLIC_URL=''):
            self.assertEqual(self.client.get(f'{API}/spools/labels/').data, {'public_url': ''})

    def test_restore_keeps_label(self):
        # 삭제 되돌리기: 라벨을 붙였던 스풀은 다시 만들어도 `라벨 뽑음`
        res = self.client.post(f'{API}/spools/', {'color': self.color.pk, 'code_no': 99, 'label_printed': True})
        self.assertEqual((res.status_code, res.data['label_printed']), (201, True))

    def test_scan_shows_names_and_order(self):
        from expenses.models import Expense, ExpenseItem

        spool = self.spools[0]
        res = self.client.get(f'{API}/spools/code/{spool.code}/')
        self.assertEqual(
            (res.data['color_name'], res.data['color_hex'], res.data['filament_name'], res.data['order']),
            ('화이트', '#FFFFFF', 'Bambu Lab › PLA Basic', None),
        )
        expense = Expense.objects.create(
            date=date(2026, 10, 27), name='PLA Basic 10롤', category='filament', amount=140000
        )
        spool.buy = ExpenseItem.objects.create(expense=expense, color=self.color, qty=1)
        spool.save()
        with CaptureQueriesContext(connection) as queries:
            res = self.client.get(f'{API}/spools/code/{spool.code}/')
        self.assertEqual(
            res.data['order'], {'expense': expense.pk, 'date': date(2026, 10, 27), 'name': 'PLA Basic 10롤'}
        )
        self.assertEqual(len(queries), 1)
