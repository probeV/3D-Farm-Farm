from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase

from products.models import CostSetting, Product
from stock.models import Part

from ..models import Sale, SaleChannel, SaleItem, SalePart


class SaleTests(TestCase):
    def test_store_fee_uses_cost_setting(self):
        # (42,700 + 0) × (1.98 + 2.73)% = 2,011.17 → 2,011
        self.assertEqual(Sale.store_fee(42700, 0), Decimal('2011'))
        # (24,000 + 3,000) × 4.71% = 1,271.7 → 1,272 (반올림)
        self.assertEqual(Sale.store_fee(24000, 3000), Decimal('1272'))

    def test_store_fee_follows_setting_change(self):
        s = CostSetting.load()
        s.fee_order, s.fee_sales = Decimal('2'), Decimal('3')
        s.save()
        self.assertEqual(Sale.store_fee(10000, 0), Decimal('500'))

    def test_order_no_unique_only_when_filled(self):
        Sale.objects.create(channel=SaleChannel.STORE, order_no='2026102790123')
        # 주문번호가 빈 판매(직접 판매 등)는 여러 개 가능
        Sale.objects.create(channel=SaleChannel.DIRECT)
        Sale.objects.create(channel=SaleChannel.DIRECT)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Sale.objects.create(channel=SaleChannel.STORE, order_no='2026102790123')


class SaleItemTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(name='분수 원판 세트')
        self.sale = Sale.objects.create()

    def test_product_name_copied_on_save(self):
        item = SaleItem.objects.create(sale=self.sale, product=self.product, qty=2, unit_price=18900)
        self.assertEqual(item.product_name, '분수 원판 세트')
        # 제품 이름을 바꿔도 판매 줄은 팔 때 이름 그대로
        self.product.name = '분수 원판 세트 (자석형)'
        self.product.save()
        item.refresh_from_db()
        self.assertEqual(item.product_name, '분수 원판 세트')

    def test_product_delete_keeps_item(self):
        item = SaleItem.objects.create(sale=self.sale, product=self.product, qty=1, unit_price=18900)
        self.product.delete()
        item.refresh_from_db()
        self.assertIsNone(item.product)
        self.assertEqual(item.product_name, '분수 원판 세트')

    def test_amount_and_cost_total(self):
        item = SaleItem(sale=self.sale, product=self.product, qty=2, unit_price=18900, unit_cost=3227)
        self.assertEqual(item.amount, 37800)
        self.assertEqual(item.cost_total, 6454)
        # 원가 없음(원가 계산표에 입력이 덜 된 제품)
        self.assertIsNone(SaleItem(sale=self.sale, qty=2, unit_price=8900).cost_total)

    def test_sale_delete_deletes_items(self):
        SaleItem.objects.create(sale=self.sale, product=self.product, qty=1, unit_price=18900)
        self.sale.delete()
        self.assertFalse(SaleItem.objects.exists())


class SalePartTests(TestCase):
    def test_name_copied_and_kept_after_part_deleted(self):
        part = Part.objects.create(name='오테뮤 청축 스위치')
        line = SalePart.objects.create(sale=Sale.objects.create(), part=part, qty=150)
        self.assertEqual(line.part_name, '오테뮤 청축 스위치')
        part.delete()
        line.refresh_from_db()
        self.assertEqual((line.part, line.part_name), (None, '오테뮤 청축 스위치'))
