from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from filaments.models import Brand, Color, Filament, Material

from ..models import Category, CostSetting, Part, Product, ProductFilament, ProductPart, Subcategory


class CategoryTests(TestCase):
    def setUp(self):
        self.edu = Category.objects.create(name='수업 교구')
        self.math = Subcategory.objects.create(category=self.edu, name='수학')

    def test_category_name_unique(self):
        with self.assertRaises(IntegrityError):
            Category.objects.create(name='수업 교구')

    def test_subcategory_name_unique_within_category(self):
        Subcategory.objects.create(category=Category.objects.create(name='퍼즐'), name='수학')
        with self.assertRaises(IntegrityError):
            Subcategory.objects.create(category=self.edu, name='수학')

    def test_str(self):
        self.assertEqual(str(self.math), '수업 교구 › 수학')

    def test_deleting_empty_category_deletes_subcategories(self):
        self.edu.delete()
        self.assertFalse(Subcategory.objects.exists())

    def test_category_with_products_cannot_be_deleted(self):
        Product.objects.create(name='분수 원판 세트', category=self.edu)
        with self.assertRaises(ProtectedError):
            self.edu.delete()

    def test_subcategory_with_products_cannot_be_deleted(self):
        Product.objects.create(name='분수 원판 세트', category=self.edu, subcategory=self.math)
        for obj in [self.math, self.edu]:
            with self.subTest(obj=obj), transaction.atomic(), self.assertRaises(ProtectedError):
                obj.delete()


class ProductTests(TestCase):
    def setUp(self):
        self.edu = Category.objects.create(name='수업 교구')
        self.math = Subcategory.objects.create(category=self.edu, name='수학')

    def test_defaults(self):
        product = Product.objects.create(name='분수 원판 세트')
        self.assertEqual(product.status, Product.Status.DEVELOPING)
        self.assertIsNone(product.category)
        self.assertIsNone(product.print_minutes)
        self.assertIsNone(product.sale_price)

    def test_blank_no_gets_next_number(self):
        first = Product.objects.create(name='분수 원판 세트')
        second = Product.objects.create(name='소마 큐브')
        self.assertEqual((first.no, second.no), (1, 2))

    def test_next_no_follows_largest_number(self):
        Product.objects.create(name='소마 큐브', no=41)
        self.assertEqual(Product.objects.create(name='하노이 탑').no, 42)

    def test_no_unique(self):
        Product.objects.create(name='분수 원판 세트', no=1)
        with self.assertRaises(IntegrityError):
            Product.objects.create(name='소마 큐브', no=1)

    def test_no_must_be_positive(self):
        with self.assertRaises(ValidationError):
            Product(name='소마 큐브', no=0).full_clean()

    def test_no_kept_on_later_save(self):
        product = Product.objects.create(name='분수 원판 세트')
        Product.objects.create(name='소마 큐브')
        product.note = '메모'
        product.save()
        product.refresh_from_db()
        self.assertEqual(product.no, 1)

    def test_sorted_by_number_not_text(self):
        for no in [10, 2, 1]:
            Product.objects.create(name=f'제품 {no}', no=no)
        self.assertEqual([p.no for p in Product.objects.all()], [1, 2, 10])

    def test_str(self):
        self.assertEqual(str(Product(name='소마 큐브', no=3)), '3. 소마 큐브')
        self.assertEqual(str(Product(name='소마 큐브')), '소마 큐브')

    def test_subcategory_must_belong_to_category(self):
        puzzle = Category.objects.create(name='퍼즐')
        for category in [puzzle, None]:
            with self.subTest(category=category), self.assertRaises(ValidationError):
                Product(name='소마 큐브', category=category, subcategory=self.math).full_clean()

    def test_subcategory_in_category_is_valid(self):
        Product(name='분수 원판 세트', category=self.edu, subcategory=self.math).full_clean()
        Product(name='분수 원판 세트', category=self.edu).full_clean()


class ProductMaterialTests(TestCase):
    def setUp(self):
        self.filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'),
            material=Material.objects.create(name='PLA'),
            price=Decimal('20000'),
        )
        self.white = Color.objects.create(filament=self.filament, name='화이트', hex='#FFFFFF')
        self.red = Color.objects.create(filament=self.filament, name='레드', hex='#FF0000', price=Decimal('30000'))
        self.magnet = Part.objects.create(name='네오디뮴 자석', price=Decimal('12000'), pack_qty=200)
        self.product = Product.objects.create(name='분수 원판 세트')

    def test_price_per_g_uses_color_price(self):
        row = ProductFilament(product=self.product, filament=self.filament, color=self.red, grams=50)
        self.assertEqual(row.price_per_g, Decimal('30'))

    def test_price_per_g_falls_back_to_filament(self):
        for color in [self.white, None]:  # 색상 가격 없음 / 색상 선택 안 함
            with self.subTest(color=color):
                row = ProductFilament(product=self.product, filament=self.filament, color=color, grams=50)
                self.assertEqual(row.price_per_g, Decimal('20'))

    def test_price_per_g_none_without_price(self):
        self.filament.price = None
        row = ProductFilament(product=self.product, filament=self.filament, grams=50)
        self.assertIsNone(row.price_per_g)

    def test_same_filament_in_several_rows(self):
        ProductFilament.objects.create(product=self.product, filament=self.filament, color=self.white, grams=30)
        ProductFilament.objects.create(product=self.product, filament=self.filament, color=self.red, grams=20)
        self.assertEqual(self.product.filaments.count(), 2)

    def test_color_must_belong_to_filament(self):
        other = Filament.objects.create(brand=self.filament.brand, material=self.filament.material, series='Matte')
        with self.assertRaises(ValidationError):
            ProductFilament(product=self.product, filament=other, color=self.red, grams=10).full_clean()

    def test_deleting_color_clears_row_color(self):
        row = ProductFilament.objects.create(product=self.product, filament=self.filament, color=self.red, grams=20)
        self.red.delete()
        row.refresh_from_db()
        self.assertIsNone(row.color)
        self.assertEqual(row.price_per_g, Decimal('20'))

    def test_used_filament_and_part_cannot_be_deleted(self):
        ProductFilament.objects.create(product=self.product, filament=self.filament, grams=20)
        ProductPart.objects.create(product=self.product, part=self.magnet, qty=2)
        for obj in [self.filament, self.magnet]:
            with self.subTest(obj=obj), transaction.atomic(), self.assertRaises(ProtectedError):
                obj.delete()

    def test_deleting_product_deletes_rows(self):
        ProductFilament.objects.create(product=self.product, filament=self.filament, grams=20)
        ProductPart.objects.create(product=self.product, part=self.magnet, qty=2)
        self.product.delete()
        self.assertFalse(ProductFilament.objects.exists())
        self.assertFalse(ProductPart.objects.exists())

    def test_part_unit_price(self):
        self.assertEqual(self.magnet.unit_price, Decimal('60'))
        self.assertIsNone(Part(name='에어캡').unit_price)

    def test_part_name_unique(self):
        with self.assertRaises(IntegrityError):
            Part.objects.create(name=self.magnet.name)

    def test_part_defaults(self):
        part = Part.objects.create(name='에어캡')
        self.assertEqual((part.pack_qty, part.unit), (1, '개'))


class CostSettingTests(TestCase):
    def test_load_creates_defaults(self):
        setting = CostSetting.load()
        self.assertEqual(setting.pk, 1)
        self.assertEqual(setting.power_kw, Decimal('0.36'))
        self.assertEqual(setting.elec_rate, 215)
        self.assertEqual(setting.printer_price, 0)
        self.assertEqual(setting.printer_life_hours, 5000)
        self.assertEqual(setting.failure_rate, 0)
        self.assertEqual(setting.fee_order, Decimal('1.98'))
        self.assertEqual(setting.fee_sales, Decimal('2.73'))
        self.assertEqual(setting.shipping_cost, 0)
        self.assertEqual(setting.target_margin, 40)

    def test_always_one_row(self):
        CostSetting.load()
        CostSetting(elec_rate=300).save()
        self.assertEqual(CostSetting.objects.count(), 1)
        self.assertEqual(CostSetting.load().elec_rate, 300)

    def test_percent_range(self):
        with self.assertRaises(ValidationError):
            CostSetting(fee_sales=101).full_clean()


class AdminPagesTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User

        self.client.force_login(User.objects.create_superuser('admin', password='x'))
        self.edu = Category.objects.create(name='수업 교구')
        self.math = Subcategory.objects.create(category=self.edu, name='수학')

    def test_changelist_and_add_pages_render(self):
        for model in ['category', 'subcategory', 'part', 'product', 'costsetting']:
            for page in ['', 'add/']:
                with self.subTest(model=model, page=page):
                    res = self.client.get(f'/admin/products/{model}/{page}')
                    self.assertEqual(res.status_code, 200)

    def test_cost_setting_cannot_be_added_twice(self):
        CostSetting.load()
        self.assertEqual(self.client.get('/admin/products/costsetting/add/').status_code, 403)

    def add_product(self, category, subcategory):
        return self.client.post(
            '/admin/products/product/add/',
            {
                'no': '',
                'name': '분수 원판 세트',
                'category': category,
                'subcategory': subcategory,
                'status': 'developing',
                'filaments-TOTAL_FORMS': '0',
                'filaments-INITIAL_FORMS': '0',
                'parts-TOTAL_FORMS': '0',
                'parts-INITIAL_FORMS': '0',
            },
        )

    def test_admin_add_product_gets_next_no(self):
        self.assertEqual(self.add_product(self.edu.pk, self.math.pk).status_code, 302)
        self.assertEqual(Product.objects.get().no, 1)

    def test_admin_search_by_name_or_no(self):
        soma = Product.objects.create(name='소마 큐브', no=3)
        Product.objects.create(name='하노이 탑', no=30)
        for term in ['소마', '3']:
            with self.subTest(term=term):
                res = self.client.get('/admin/products/product/', {'q': term})
                self.assertEqual(list(res.context['cl'].result_list), [soma])

    def test_admin_rejects_subcategory_of_other_category(self):
        res = self.add_product('', self.math.pk)
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, '세부 분류는 고른 카테고리 안에서 골라야 합니다.')
