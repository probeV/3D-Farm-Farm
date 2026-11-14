from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase as BaseAPITestCase

from filaments.tests.utils import TempMediaMixin, image_size, make_image
from products.models import Product, ProductPart

from ..models import PackSet, PackSetLine, Part, PartCategory, PartKind, StockHistory

API = '/api/v0'


class APITestCase(BaseAPITestCase):
    def setUp(self):
        self.magnet = Part.objects.create(name='네오디뮴 자석', price=Decimal('12000'), pack_qty=200)


class PartApiTests(APITestCase):
    def test_list_with_unit_price_and_product_count(self):
        Part.objects.create(name='에어캡', unit='롤')
        product = Product.objects.create(name='분수 원판 세트')
        # 같은 제품에 두 줄이어도 제품 수는 1
        ProductPart.objects.create(product=product, part=self.magnet, qty=2)
        ProductPart.objects.create(product=product, part=self.magnet, qty=3)
        res = self.client.get(f'{API}/parts/')
        self.assertEqual(
            [(p['name'], p['unit_price'], p['product_count']) for p in res.data],
            [('네오디뮴 자석', 60.0, 1), ('에어캡', None, 0)],
        )

    def test_unit_price_rounded(self):
        part = Part.objects.create(name='OPP 봉투', price=Decimal('10000'), pack_qty=3)
        res = self.client.get(f'{API}/parts/{part.pk}/')
        self.assertEqual(res.data['unit_price'], 3333.33)

    def test_create_with_defaults(self):
        res = self.client.post(f'{API}/parts/', {'name': 'M3 볼트'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['pack_qty'], res.data['unit'], res.data['price']), (1, '개', None))

    def test_duplicate_name(self):
        res = self.client.post(f'{API}/parts/', {'name': '네오디뮴 자석'})
        self.assertEqual((res.status_code, res.data['name']), (400, ['이미 있는 품목입니다.']))

    def test_patch_keeps_own_name(self):
        res = self.client.patch(f'{API}/parts/{self.magnet.pk}/', {'name': '네오디뮴 자석', 'price': 15000})
        self.assertEqual((res.status_code, res.data['unit_price']), (200, 75.0))

    def test_pack_qty_must_be_positive(self):
        res = self.client.post(f'{API}/parts/', {'name': 'M3 볼트', 'pack_qty': 0})
        self.assertEqual(res.status_code, 400)
        self.assertIn('pack_qty', res.data)

    def test_delete_in_use_is_conflict(self):
        ProductPart.objects.create(product=Product.objects.create(name='분수 원판 세트'), part=self.magnet)
        res = self.client.delete(f'{API}/parts/{self.magnet.pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '제품에서 쓰고 있어서 삭제할 수 없습니다.'))


class PartCategoryApiTests(APITestCase):
    def test_initial_categories_and_counts(self):
        # 마이그레이션이 처음 카테고리(부품 · 포장재 · 기타)를 만들고, v2 에서 포장재는 포장 탭으로 옮긴다
        self.magnet.category = PartCategory.objects.get(name='부품')
        self.magnet.save()
        res = self.client.get(f'{API}/part-categories/')
        self.assertEqual(
            [(c['kind'], c['name'], c['part_count']) for c in res.data],
            [('pack', '포장재', 0), ('part', '기타', 0), ('part', '부품', 1)],
        )

    def test_duplicate_name(self):
        res = self.client.post(f'{API}/part-categories/', {'name': '부품'})
        self.assertEqual((res.status_code, res.data['name']), (400, ['이미 있는 카테고리 이름입니다.']))

    def test_delete_makes_parts_uncategorized(self):
        packing = PartCategory.objects.get(name='포장재')
        box = Part.objects.create(name='소형 박스', category=packing)
        self.assertEqual(self.client.delete(f'{API}/part-categories/{packing.pk}/').status_code, 204)
        box.refresh_from_db()
        self.assertIsNone(box.category)


class PartFieldsApiTests(APITestCase):
    def test_category_and_buy_url(self):
        packing = PartCategory.objects.get(name='포장재')
        res = self.client.post(
            f'{API}/parts/',
            {'kind': 'pack', 'name': 'OPP 봉투', 'category': packing.pk, 'buy_url': 'https://example.com/opp'},
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['category'], res.data['buy_url']), (packing.pk, 'https://example.com/opp'))

    def test_bad_buy_url(self):
        res = self.client.post(f'{API}/parts/', {'name': 'OPP 봉투', 'buy_url': 'example'})
        self.assertEqual((res.status_code, res.data['buy_url']), (400, ['https:// 로 시작하는 주소로 입력하세요.']))


class KindApiTests(APITestCase):
    """탭(kind) · 처음 수량 · 탭 필터"""

    def setUp(self):
        super().setUp()
        self.box = PartCategory.objects.create(kind=PartKind.PACK, name='박스')

    def test_create_with_kind_and_initial_stock(self):
        body = {'kind': 'pack', 'name': '소형 박스', 'category': self.box.pk, 'stock': 50}
        res = self.client.post(f'{API}/parts/', body)
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['kind'], res.data['stock']), ('pack', 50))
        self.assertNotIn('alert', res.data)  # 부족 알림 기준은 설정 (탭마다 하나)
        row = StockHistory.objects.get()
        self.assertEqual((row.kind, row.qty, row.after, row.note), ('adjust', 50, 50, '처음 수량'))

    def test_create_without_stock_records_nothing(self):
        res = self.client.post(f'{API}/parts/', {'name': 'M3 볼트'})
        self.assertEqual((res.status_code, res.data['stock']), (201, 0))
        self.assertFalse(StockHistory.objects.exists())

    def test_category_must_match_kind(self):
        res = self.client.post(f'{API}/parts/', {'name': '자석 2', 'category': self.box.pk})
        self.assertEqual((res.status_code, res.data['category']), (400, ['같은 탭의 카테고리를 고르세요.']))

    def test_kind_cannot_change(self):
        res = self.client.patch(f'{API}/parts/{self.magnet.pk}/', {'kind': 'pack'})
        self.assertEqual((res.status_code, res.data['kind']), (400, ['종류는 바꿀 수 없습니다.']))

    def test_stock_cannot_be_patched(self):
        res = self.client.patch(f'{API}/parts/{self.magnet.pk}/', {'stock': 5})
        self.assertEqual((res.status_code, res.data['stock']), (400, ['남은 수량은 조정으로 바꾸세요.']))

    def test_filter_by_kind(self):
        Part.objects.create(kind=PartKind.SUPPLY, name='순간접착제')
        res = self.client.get(f'{API}/parts/?kind=supply')
        self.assertEqual([p['name'] for p in res.data], ['순간접착제'])
        self.assertEqual(self.client.get(f'{API}/parts/?kind=x').status_code, 400)
        res = self.client.get(f'{API}/part-categories/?kind=pack')
        self.assertEqual([c['name'] for c in res.data], ['박스', '포장재'])

    def test_category_name_unique_within_kind(self):
        res = self.client.post(f'{API}/part-categories/', {'kind': 'pack', 'name': '박스'})
        self.assertEqual((res.status_code, res.data['name']), (400, ['이미 있는 카테고리 이름입니다.']))
        res = self.client.post(f'{API}/part-categories/', {'kind': 'supply', 'name': '박스'})
        self.assertEqual(res.status_code, 201)


class PhotoApiTests(TempMediaMixin, BaseAPITestCase):
    def test_upload_shrinks_and_null_removes(self):
        res = self.client.post(f'{API}/parts/', {'name': '자석', 'photo': make_image(size=(1200, 800))})
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['photo'].startswith('/media/parts/'))
        part = Part.objects.get()
        self.assertEqual(image_size(part.photo), (512, 341))
        res = self.client.patch(f'{API}/parts/{part.pk}/', {'photo': None}, format='json')
        self.assertIsNone(res.data['photo'])


class AdjustApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.glue = Part.objects.create(kind=PartKind.SUPPLY, name='순간접착제', stock=3)

    def test_adjust_modes_and_history(self):
        url = f'{API}/parts/{self.magnet.pk}/adjust/'
        res = self.client.post(url, {'mode': 'set', 'qty': 100, 'note': '실사'})
        self.assertEqual((res.status_code, res.data['stock']), (200, 100))
        self.assertEqual(self.client.post(url, {'mode': 'sub', 'qty': 3}).data['stock'], 97)
        self.assertEqual(self.client.post(url, {'mode': 'add', 'qty': 0.5}).data['stock'], 97.5)
        rows = self.client.get(f'{API}/parts/{self.magnet.pk}/history/').data
        self.assertEqual(len(rows), 3)
        self.assertEqual(
            (rows[-1]['kind'], rows[-1]['qty'], rows[-1]['after'], rows[-1]['note']), ('adjust', 100, 100, '실사')
        )

    def test_adjust_bad_input(self):
        url = f'{API}/parts/{self.magnet.pk}/adjust/'
        self.assertIn('mode', self.client.post(url, {'mode': 'x', 'qty': 1}).data)
        self.assertEqual(self.client.post(url, {'mode': 'sub', 'qty': 0}).data['qty'], ['0 보다 큰 수량을 넣으세요.'])
        self.assertEqual(self.client.post(url, {'mode': 'add', 'qty': -1}).status_code, 400)

    def test_use_supply(self):
        res = self.client.post(f'{API}/parts/{self.glue.pk}/use/', {'note': '굳음'})
        self.assertEqual((res.status_code, res.data['stock']), (200, 2))
        self.assertEqual(res.data['last_used'], str(timezone.localdate()))
        self.assertEqual(StockHistory.objects.get().note, '다 씀 (굳음)')

    def test_use_only_supply(self):
        res = self.client.post(f'{API}/parts/{self.magnet.pk}/use/')
        self.assertEqual((res.status_code, res.data['detail']), (400, '소모품만 다 씀으로 뺄 수 있습니다.'))


class PackSetApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', price=8900, pack_qty=500)
        self.sticker = Part.objects.create(kind=PartKind.PACK, name='스티커', price=15000, pack_qty=1000)

    def test_create_merges_same_part(self):
        lines = [{'part': self.bag.pk, 'qty': 1}, {'part': self.bag.pk, 'qty': 1}]
        res = self.client.post(f'{API}/pack-sets/', {'name': '봉투 포장', 'lines': lines}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual([(ln['part'], ln['qty']) for ln in res.data['lines']], [(self.bag.pk, 2)])
        self.assertEqual(res.data['product_count'], 0)

    def test_lines_required_and_pack_only(self):
        res = self.client.post(f'{API}/pack-sets/', {'name': '빈 세트', 'lines': []}, format='json')
        self.assertEqual(res.data['lines'], ['포장재를 한 개 이상 넣으세요.'])
        lines = [{'part': self.magnet.pk, 'qty': 1}]
        res = self.client.post(f'{API}/pack-sets/', {'name': '세트', 'lines': lines}, format='json')
        self.assertEqual(res.data['lines'][0]['part'], ['포장재만 고를 수 있습니다.'])

    def test_patch_lines_and_delete_rules(self):
        pack = PackSet.objects.create(name='봉투 포장')
        PackSetLine.objects.create(pack_set=pack, part=self.bag, qty=1)
        lines = [{'part': self.bag.pk, 'qty': 1}, {'part': self.sticker.pk, 'qty': 1}]
        res = self.client.patch(f'{API}/pack-sets/{pack.pk}/', {'lines': lines}, format='json')
        self.assertEqual(len(res.data['lines']), 2)
        # 세트에서 쓰는 포장재는 삭제 불가
        res = self.client.delete(f'{API}/parts/{self.bag.pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '포장 세트에서 쓰고 있어서 삭제할 수 없습니다.'))
        self.assertEqual(self.client.get(f'{API}/parts/{self.bag.pk}/').data['set_count'], 1)
        # 기본 포장으로 쓰는 제품이 있으면 세트 삭제 불가
        Product.objects.create(name='이름 키링', default_pack=pack)
        res = self.client.delete(f'{API}/pack-sets/{pack.pk}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['detail'], '기본 포장으로 쓰는 제품이 있어서 삭제할 수 없습니다.')
        self.assertEqual(self.client.get(f'{API}/pack-sets/{pack.pk}/').data['product_count'], 1)
