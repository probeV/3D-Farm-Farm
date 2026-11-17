from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from filaments.models import Brand, Color, Filament, Material, Spool
from stock.models import PackSet, Part, PartKind

from ..models import Category, CostSetting, Product, ProductFilament, ProductPart, Subcategory

API = '/api/v0'


class ApiTestCase(APITestCase):
    def setUp(self):
        self.filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'),
            material=Material.objects.create(name='PLA'),
            price=Decimal('14400'),
        )
        self.white = Color.objects.create(filament=self.filament, name='화이트', hex='#FFFFFF')
        self.red = Color.objects.create(filament=self.filament, name='레드', hex='#FF0000')
        self.magnet = Part.objects.create(name='네오디뮴 자석', price=Decimal('12000'), pack_qty=200)
        self.edu = Category.objects.create(name='수업 교구')
        self.math = Subcategory.objects.create(category=self.edu, name='수학')


class CategoryApiTests(ApiTestCase):
    def test_list_with_subcategories_and_counts(self):
        Subcategory.objects.create(category=self.edu, name='과학')
        Category.objects.create(name='퍼즐')
        Product.objects.create(name='분수 원판 세트', category=self.edu, subcategory=self.math)
        Product.objects.create(name='기어 키트', category=self.edu)
        res = self.client.get(f'{API}/categories/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([(c['name'], c['product_count']) for c in res.data], [('수업 교구', 2), ('퍼즐', 0)])
        self.assertEqual(
            [(s['name'], s['product_count']) for s in res.data[0]['subcategories']], [('과학', 0), ('수학', 1)]
        )

    def test_create_and_duplicate_name(self):
        res = self.client.post(f'{API}/categories/', {'name': '퍼즐'})
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['product_count'], res.data['subcategories']), (0, []))
        res = self.client.post(f'{API}/categories/', {'name': '퍼즐'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['name'], ['이미 있는 카테고리 이름입니다.'])

    def test_delete_empty_category_with_subcategories(self):
        self.assertEqual(self.client.delete(f'{API}/categories/{self.edu.pk}/').status_code, 204)
        self.assertFalse(Subcategory.objects.exists())

    def test_delete_with_products_is_conflict(self):
        # 카테고리에 직접 있는 제품 / 세부 분류에 있는 제품 모두 막힘
        for subcategory in [None, self.math]:
            with self.subTest(subcategory=subcategory):
                product = Product.objects.create(name='분수 원판 세트', category=self.edu, subcategory=subcategory)
                res = self.client.delete(f'{API}/categories/{self.edu.pk}/')
                self.assertEqual(res.status_code, 409)
                self.assertEqual(res.data['detail'], '제품이 있어서 삭제할 수 없습니다.')
                product.delete()


class SubcategoryApiTests(ApiTestCase):
    def test_create_and_duplicate_in_same_category(self):
        res = self.client.post(f'{API}/subcategories/', {'category': self.edu.pk, 'name': '과학'})
        self.assertEqual((res.status_code, res.data['product_count']), (201, 0))
        res = self.client.post(f'{API}/subcategories/', {'category': self.edu.pk, 'name': '수학'})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['name'], ['이 카테고리에 같은 이름의 세부 분류가 이미 있습니다.'])

    def test_same_name_in_other_category(self):
        puzzle = Category.objects.create(name='퍼즐')
        res = self.client.post(f'{API}/subcategories/', {'category': puzzle.pk, 'name': '수학'})
        self.assertEqual(res.status_code, 201)

    def test_rename(self):
        res = self.client.patch(f'{API}/subcategories/{self.math.pk}/', {'name': '산수'})
        self.assertEqual((res.status_code, res.data['name']), (200, '산수'))

    def test_category_cannot_change(self):
        puzzle = Category.objects.create(name='퍼즐')
        res = self.client.patch(f'{API}/subcategories/{self.math.pk}/', {'category': puzzle.pk})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['category'], ['세부 분류의 카테고리는 바꿀 수 없습니다.'])

    def test_delete_with_products_is_conflict(self):
        Product.objects.create(name='분수 원판 세트', category=self.edu, subcategory=self.math)
        res = self.client.delete(f'{API}/subcategories/{self.math.pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '제품이 있어서 삭제할 수 없습니다.'))


class ReplacePartApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.big = Part.objects.create(name='네오디뮴 자석 (대용량)', price=Decimal('20000'), pack_qty=500)
        self.a = Product.objects.create(name='분수 원판 세트')
        self.b = Product.objects.create(name='소마 큐브')
        self.c = Product.objects.create(name='이름 키링')
        for p, qty in [(self.a, 12), (self.b, 4), (self.c, 2)]:
            ProductPart.objects.create(product=p, part=self.magnet, qty=qty)
        ProductPart.objects.create(product=self.c, part=self.big, qty=3)

    def replace(self, **data):
        return self.client.post(f'{API}/parts/{self.magnet.pk}/replace/', data, format='json')

    def rows(self, product):
        return [(r.part_id, r.qty) for r in product.parts.order_by('id')]

    def test_replace_all_merges_existing_row(self):
        res = self.replace(to=self.big.pk)
        self.assertEqual((res.status_code, res.data), (200, {'replaced': 3}))
        self.assertEqual(self.rows(self.a), [(self.big.pk, 12)])
        self.assertEqual(self.rows(self.c), [(self.big.pk, 5)])  # 이미 있던 줄에 더함
        self.assertFalse(self.magnet.product_parts.exists())
        self.assertTrue(Part.objects.filter(pk=self.magnet.pk).exists())  # 부자재 자체는 그대로

    def test_replace_picked_products_only(self):
        res = self.replace(to=self.big.pk, products=[self.b.pk])
        self.assertEqual(res.data, {'replaced': 1})
        self.assertEqual(self.rows(self.a), [(self.magnet.pk, 12)])
        self.assertEqual(self.rows(self.b), [(self.big.pk, 4)])

    def test_bad_input(self):
        self.assertEqual(self.replace(to=self.magnet.pk).data['to'], ['다른 부자재를 고르세요.'])
        self.assertEqual(self.replace(to=999).data['to'], ['없는 부자재입니다.'])
        other = Product.objects.create(name='하노이 탑')
        res = self.replace(to=self.big.pk, products=[other.pk])
        self.assertEqual((res.status_code, res.data['products']), (400, ['이 부자재를 쓰는 제품을 고르세요.']))
        self.assertEqual(self.rows(self.a), [(self.magnet.pk, 12)])


class ProductApiTests(ApiTestCase):
    def product_data(self, **overrides):
        return {
            'name': '분수 원판 세트',
            'category': self.edu.pk,
            'subcategory': self.math.pk,
            'status': 'on_sale',
            'print_minutes': 200,
            'sale_price': 18900,
            'filaments': [
                {'filament': self.filament.pk, 'color': self.red.pk, 'grams': 24},
                {'filament': self.filament.pk, 'color': None, 'grams': 24.37},
            ],
            'parts': [{'part': self.magnet.pk, 'qty': 12}],
            **overrides,
        }

    def create(self, **overrides):
        return self.client.post(f'{API}/products/', self.product_data(**overrides), format='json')

    def test_create_with_rows(self):
        res = self.create()
        self.assertEqual(res.status_code, 201)
        self.assertNotIn('no', res.data)
        self.assertEqual(
            [(r['color'], r['grams']) for r in res.data['filaments']],
            [(self.red.pk, 24), (None, 24.37)],
        )
        self.assertEqual([(r['part'], r['qty']) for r in res.data['parts']], [(self.magnet.pk, 12)])
        self.assertEqual(ProductFilament.objects.count(), 2)

    def test_create_minimal(self):
        res = self.client.post(f'{API}/products/', {'name': '도형 칠교'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            (res.data['status'], res.data['category'], res.data['print_minutes'], res.data['sale_price']),
            ('developing', None, None, None),
        )
        self.assertEqual((res.data['filaments'], res.data['parts']), ([], []))

    def test_subcategory_must_belong_to_category(self):
        puzzle = Category.objects.create(name='퍼즐')
        for category in [puzzle.pk, None]:
            with self.subTest(category=category):
                res = self.create(category=category)
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.data['subcategory'], ['세부 분류는 고른 카테고리 안에서 골라야 합니다.'])

    def test_patch_category_only_checks_existing_subcategory(self):
        product = self.create().data
        puzzle = Category.objects.create(name='퍼즐')
        res = self.client.patch(f'{API}/products/{product["id"]}/', {'category': puzzle.pk}, format='json')
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(
            f'{API}/products/{product["id"]}/', {'category': puzzle.pk, 'subcategory': None}, format='json'
        )
        self.assertEqual(res.status_code, 200)

    def test_color_must_belong_to_filament(self):
        other = Filament.objects.create(brand=self.filament.brand, material=self.filament.material, series='Matte')
        res = self.create(filaments=[{'filament': other.pk, 'color': self.red.pk, 'grams': 10}])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['filaments'][0]['color'], ['색상은 고른 필라멘트의 색상이어야 합니다.'])
        self.assertFalse(Product.objects.exists())

    def test_negative_grams_rejected(self):
        res = self.create(filaments=[{'filament': self.filament.pk, 'grams': -1}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('grams', res.data['filaments'][0])

    def test_grams_up_to_two_decimals(self):
        res = self.create(filaments=[{'filament': self.filament.pk, 'grams': 24.375}])
        self.assertEqual(res.status_code, 400)
        self.assertIn('grams', res.data['filaments'][0])

    def test_patch_rows_replaces_them(self):
        product = self.create().data
        res = self.client.patch(
            f'{API}/products/{product["id"]}/',
            {'filaments': [{'filament': self.filament.pk, 'color': self.white.pk, 'grams': 30}], 'parts': []},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual([(r['color'], r['grams']) for r in res.data['filaments']], [(self.white.pk, 30)])
        self.assertEqual(res.data['parts'], [])
        self.assertEqual((ProductFilament.objects.count(), ProductPart.objects.count()), (1, 0))

    def test_patch_without_rows_keeps_them(self):
        product = self.create().data
        res = self.client.patch(f'{API}/products/{product["id"]}/', {'status': 'discontinued'}, format='json')
        self.assertEqual(res.data['status'], 'discontinued')
        self.assertEqual((len(res.data['filaments']), len(res.data['parts'])), (2, 1))

    def test_bad_row_keeps_old_rows(self):
        product = self.create().data
        res = self.client.patch(
            f'{API}/products/{product["id"]}/', {'filaments': [{'filament': 999, 'grams': 1}]}, format='json'
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(ProductFilament.objects.count(), 2)

    def test_list_in_added_order_with_few_queries(self):
        for name in ['하노이 탑', '소마 큐브', '분수 원판']:
            self.create(name=name)
        with CaptureQueriesContext(connection) as queries:
            res = self.client.get(f'{API}/products/')
        self.assertEqual([p['name'] for p in res.data], ['하노이 탑', '소마 큐브', '분수 원판'])
        self.assertLessEqual(len(queries), 3)  # 제품 + 필라멘트 줄 + 부자재 줄

    def test_delete_product_deletes_rows(self):
        product = self.create().data
        self.assertEqual(self.client.delete(f'{API}/products/{product["id"]}/').status_code, 204)
        self.assertEqual((ProductFilament.objects.count(), ProductPart.objects.count()), (0, 0))

    def test_unknown_status_rejected(self):
        res = self.create(status='lost')
        self.assertEqual(res.status_code, 400)
        self.assertIn('status', res.data)

    def test_put_not_allowed(self):
        product = self.create().data
        self.assertEqual(self.client.put(f'{API}/products/{product["id"]}/', {}, format='json').status_code, 405)


class FilamentInProductApiTests(ApiTestCase):
    """필라멘트 · 색상 삭제가 제품에 미치는 것 (filaments API)"""

    def test_filament_used_by_product_is_conflict(self):
        bare = Filament.objects.create(brand=self.filament.brand, material=self.filament.material, series='Matte')
        ProductFilament.objects.create(product=Product.objects.create(name='소마 큐브'), filament=bare)
        res = self.client.delete(f'{API}/filaments/{bare.pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '제품에서 쓰고 있어서 삭제할 수 없습니다.'))

    def test_filament_with_colors_message_unchanged(self):
        res = self.client.delete(f'{API}/filaments/{self.filament.pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '색상이 있어서 삭제할 수 없습니다.'))

    def test_deleting_color_clears_product_row(self):
        row = ProductFilament.objects.create(
            product=Product.objects.create(name='소마 큐브'), filament=self.filament, color=self.red, grams=20
        )
        self.assertEqual(self.client.delete(f'{API}/colors/{self.red.pk}/').status_code, 204)
        row.refresh_from_db()
        self.assertIsNone(row.color)

    def test_color_with_spools_and_products(self):
        row = ProductFilament.objects.create(
            product=Product.objects.create(name='소마 큐브'), filament=self.filament, color=self.red, grams=20
        )
        Spool.objects.create(color=self.red)
        self.assertEqual(self.client.delete(f'{API}/colors/{self.red.pk}/').status_code, 204)
        row.refresh_from_db()
        self.assertIsNone(row.color)
        self.assertFalse(Spool.objects.exists())


class CostSettingApiTests(APITestCase):
    def test_get_creates_defaults(self):
        res = self.client.get(f'{API}/cost-setting/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.data,
            {
                'power_kw': 0.36,
                'elec_rate': 215,
                'fee_order': 1.98,
                'fee_sales': 2.73,
                'shipping_cost': 0,
                'target_margin': 40,
                'alert_part': 0,
                'alert_pack': 0,
                'alert_supply': 0,
            },
        )

    def test_patch_stock_alerts(self):
        res = self.client.patch(f'{API}/cost-setting/', {'alert_part': 10, 'alert_supply': 1.5}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data['alert_part'], res.data['alert_pack'], res.data['alert_supply']), (10, 0, 1.5))
        res = self.client.patch(f'{API}/cost-setting/', {'alert_pack': -1}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('alert_pack', res.data)

    def test_patch(self):
        res = self.client.patch(f'{API}/cost-setting/', {'elec_rate': 230, 'shipping_cost': 3000}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data['elec_rate'], res.data['shipping_cost']), (230, 3000))
        self.assertEqual(CostSetting.objects.count(), 1)
        self.assertEqual(CostSetting.load().shipping_cost, 3000)

    def test_removed_printer_fields_are_ignored(self):
        res = self.client.patch(f'{API}/cost-setting/', {'printer_price': 549000, 'failure_rate': 5}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('printer_price', res.data)
        self.assertNotIn('failure_rate', res.data)

    def test_percent_over_100_rejected(self):
        res = self.client.patch(f'{API}/cost-setting/', {'fee_sales': 101}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('fee_sales', res.data)

    def test_put_and_delete_not_allowed(self):
        self.assertEqual(self.client.put(f'{API}/cost-setting/', {}, format='json').status_code, 405)
        self.assertEqual(self.client.delete(f'{API}/cost-setting/').status_code, 405)


class ProductStockApiTests(ApiTestCase):
    """v2 STOCK: 제품의 줄은 부속품만, 포장은 기본 포장 세트로"""

    def setUp(self):
        super().setUp()
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', price=8900, pack_qty=500)
        self.pack = PackSet.objects.create(name='봉투 포장')

    def test_default_pack(self):
        res = self.client.post(f'{API}/products/', {'name': '이름 키링', 'default_pack': self.pack.pk}, format='json')
        self.assertEqual((res.status_code, res.data['default_pack']), (201, self.pack.pk))
        res = self.client.patch(f'{API}/products/{res.data["id"]}/', {'default_pack': None}, format='json')
        self.assertIsNone(res.data['default_pack'])
        res = self.client.post(f'{API}/products/', {'name': '키링 2', 'default_pack': 999}, format='json')
        self.assertEqual(res.data['default_pack'], ['없는 포장 세트입니다.'])

    def test_rows_take_parts_only(self):
        body = {'name': '이름 키링', 'parts': [{'part': self.bag.pk, 'qty': 1}]}
        res = self.client.post(f'{API}/products/', body, format='json')
        self.assertEqual(res.data['parts'][0]['part'], ['부속품만 고를 수 있습니다.'])

    def test_replace_to_parts_only(self):
        ProductPart.objects.create(product=Product.objects.create(name='분수 원판 세트'), part=self.magnet)
        res = self.client.post(f'{API}/parts/{self.magnet.pk}/replace/', {'to': self.bag.pk}, format='json')
        self.assertEqual(res.data['to'], ['부속품만 고를 수 있습니다.'])
