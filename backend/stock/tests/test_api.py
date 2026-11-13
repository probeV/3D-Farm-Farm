from decimal import Decimal

from rest_framework.test import APITestCase as BaseAPITestCase

from products.models import Product, ProductPart

from ..models import Part, PartCategory

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
        # 마이그레이션이 처음 카테고리(부품 · 포장재 · 기타)를 만든다
        self.magnet.category = PartCategory.objects.get(name='부품')
        self.magnet.save()
        res = self.client.get(f'{API}/part-categories/')
        self.assertEqual([(c['name'], c['part_count']) for c in res.data], [('기타', 0), ('부품', 1), ('포장재', 0)])

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
            f'{API}/parts/', {'name': 'OPP 봉투', 'category': packing.pk, 'buy_url': 'https://example.com/opp'}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['category'], res.data['buy_url']), (packing.pk, 'https://example.com/opp'))

    def test_bad_buy_url(self):
        res = self.client.post(f'{API}/parts/', {'name': 'OPP 봉투', 'buy_url': 'example'})
        self.assertEqual((res.status_code, res.data['buy_url']), (400, ['https:// 로 시작하는 주소로 입력하세요.']))
