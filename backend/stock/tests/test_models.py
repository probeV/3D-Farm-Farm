"""재고 관리 (v2 STOCK) — 품목 종류 · 포장 세트 · 남은 수량 · 판매로 빠지는 수량"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from products.models import Product, ProductPart
from sales.models import Sale, SaleItem, SalePack, SalePart, default_parts

from .. import services
from ..models import PackSet, PackSetLine, Part, PartCategory, PartKind, StockHistory


class PartTests(TestCase):
    def test_part_unit_price(self):
        magnet = Part.objects.create(name='네오디뮴 자석', price=Decimal('12000'), pack_qty=200)
        self.assertEqual(magnet.unit_price, Decimal('60'))
        self.assertIsNone(Part(name='에어캡').unit_price)

    def test_part_name_unique(self):
        Part.objects.create(name='네오디뮴 자석')
        with self.assertRaises(IntegrityError):
            Part.objects.create(name='네오디뮴 자석')

    def test_part_defaults(self):
        part = Part.objects.create(name='에어캡')
        self.assertEqual((part.pack_qty, part.unit), (1, '개'))

    def test_category_name_unique_within_kind(self):
        PartCategory.objects.create(kind=PartKind.PART, name='청소')
        # 다른 탭에는 같은 이름 가능
        PartCategory.objects.create(kind=PartKind.SUPPLY, name='청소')
        with self.assertRaises(IntegrityError), transaction.atomic():
            PartCategory.objects.create(kind=PartKind.PART, name='청소')

    def test_category_must_match_kind(self):
        box = PartCategory.objects.create(kind=PartKind.PACK, name='박스')
        part = Part(kind=PartKind.PART, name='자석', category=box)
        with self.assertRaises(ValidationError):
            part.clean()
        part.kind = PartKind.PACK
        part.clean()

    def test_new_part_starts_empty(self):
        part = Part.objects.create(name='자석')
        self.assertEqual((part.kind, part.stock), (PartKind.PART, 0))


class PackSetTests(TestCase):
    def setUp(self):
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', price=8900, pack_qty=500)
        self.pack = PackSet.objects.create(name='봉투 포장')
        PackSetLine.objects.create(pack_set=self.pack, part=self.bag, qty=1)

    def test_pack_used_by_product_cannot_be_deleted(self):
        Product.objects.create(name='이름 키링', default_pack=self.pack)
        with self.assertRaises(ProtectedError):
            self.pack.delete()

    def test_part_in_pack_cannot_be_deleted(self):
        with self.assertRaises(ProtectedError):
            self.bag.delete()

    def test_deleting_pack_deletes_lines(self):
        self.pack.delete()
        self.assertFalse(PackSetLine.objects.exists())


class MoveTests(TestCase):
    def setUp(self):
        self.glue = Part.objects.create(kind=PartKind.SUPPLY, name='순간접착제', stock=3)

    def test_move_changes_stock_and_records_after(self):
        m = services.move(self.glue, StockHistory.Kind.USE, -1, '다 씀')
        self.assertEqual(self.glue.stock, 2)
        self.assertEqual((m.qty, m.after, m.note), (-1, 2, '다 씀'))
        self.assertEqual(Part.objects.get(pk=self.glue.pk).stock, 2)

    def test_zero_move_does_nothing(self):
        self.assertIsNone(services.move(self.glue, StockHistory.Kind.ADJUST, 0))
        self.assertFalse(StockHistory.objects.exists())

    def test_stock_can_go_below_zero(self):
        services.move(self.glue, StockHistory.Kind.USE, -5)
        self.assertEqual(Part.objects.get(pk=self.glue.pk).stock, -2)

    def test_adjust_modes(self):
        self.assertEqual(services.adjust(self.glue, 'set', 10, '실사').qty, 7)
        self.assertEqual(services.adjust(self.glue, 'sub', 3).qty, -3)
        self.assertEqual(services.adjust(self.glue, 'add', Decimal('0.5')).after, Decimal('7.5'))
        self.assertIsNone(services.adjust(self.glue, 'set', Decimal('7.5')))


class SaleStockTests(TestCase):
    """판매 저장 → 부속품 줄 · 포장 줄만큼 빠진다 (부속품 줄은 처음에 제품 × 수량). 고치면 차이만, 지우면 되돌림"""

    def setUp(self):
        self.ring = Part.objects.create(name='키링 고리', stock=100)
        self.magnet = Part.objects.create(name='자석', stock=100)
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', stock=50, price=8900, pack_qty=500)
        self.keyring = Product.objects.create(name='이름 키링', sale_price=5000)
        ProductPart.objects.create(product=self.keyring, part=self.ring, qty=1)
        ProductPart.objects.create(product=self.keyring, part=self.magnet, qty=2)
        self.sale = Sale.objects.create()
        self.item = SaleItem.objects.create(sale=self.sale, product=self.keyring, qty=3, unit_price=5000)
        self.pack = SalePack.objects.create(sale=self.sale, part=self.bag, qty=1, unit_price=Decimal('17.8'))
        for part, qty in default_parts([(self.keyring, 3)]).items():
            SalePart.objects.create(sale=self.sale, part=part, qty=qty)

    def stocks(self):
        return [Part.objects.get(pk=p.pk).stock for p in (self.ring, self.magnet, self.bag)]

    def test_new_sale_takes_parts_and_packs(self):
        services.sync_sale(self.sale)
        self.assertEqual(self.stocks(), [97, 94, 49])
        move = StockHistory.objects.get(part=self.ring)
        self.assertEqual((move.kind, move.qty, move.note, move.sale), ('sale', -3, '판매 · 이름 키링', self.sale))

    def test_sync_twice_changes_nothing(self):
        services.sync_sale(self.sale)
        services.sync_sale(self.sale)
        self.assertEqual(self.stocks(), [97, 94, 49])
        self.assertEqual(StockHistory.objects.count(), 3)

    def test_edit_records_only_difference(self):
        services.sync_sale(self.sale)
        self.item.qty = 1
        self.item.save()
        self.sale.parts.filter(part=self.ring).update(qty=1)
        self.sale.parts.filter(part=self.magnet).update(qty=2)
        self.pack.delete()
        services.sync_sale(self.sale)
        self.assertEqual(self.stocks(), [99, 98, 50])
        self.assertEqual(StockHistory.objects.filter(part=self.ring).first().qty, 2)

    def test_revert_on_delete(self):
        services.sync_sale(self.sale)
        services.revert_sale(self.sale)
        self.sale.delete()
        self.assertEqual(self.stocks(), [100, 100, 50])
        back = StockHistory.objects.filter(part=self.bag).first()
        self.assertEqual((back.qty, back.note, back.sale), (1, '판매 삭제 · 이름 키링', None))

    def test_deleted_product_keeps_part_lines(self):
        services.sync_sale(self.sale)
        self.keyring.delete()  # 판매 줄은 남고 product 만 비워짐 — 부속품 줄은 그대로라 재고도 그대로
        services.sync_sale(self.sale)
        self.assertEqual(self.stocks(), [97, 94, 49])

    def test_swapped_part_line_takes_that_part(self):
        red = Part.objects.create(name='적축 스위치', stock=10)
        self.sale.parts.filter(part=self.magnet).update(part=red, part_name='적축 스위치')
        services.sync_sale(self.sale)
        self.assertEqual(self.stocks(), [97, 100, 49])
        self.assertEqual(Part.objects.get(pk=red.pk).stock, 4)

    def test_sale_pack_copies_name_and_amount(self):
        self.assertEqual(self.pack.part_name, 'OPP 봉투')
        self.assertEqual(self.pack.amount, Decimal('17.80'))
        self.bag_line = SalePack(sale=self.sale, part_name='옛 봉투', qty=2)
        self.assertIsNone(self.bag_line.amount)


class AdminPagesTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User

        self.client.force_login(User.objects.create_superuser('admin', password='x'))
        Part.objects.create(name='자석')

    def test_changelist_and_add_pages_render(self):
        part = Part.objects.get()
        for model in ['partcategory', 'part', 'packset']:
            for page in ['', 'add/']:
                with self.subTest(model=model, page=page):
                    self.assertEqual(self.client.get(f'/admin/stock/{model}/{page}').status_code, 200)
        self.assertEqual(self.client.get(f'/admin/stock/part/{part.pk}/change/').status_code, 200)
