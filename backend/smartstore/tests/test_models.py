from django.db import IntegrityError, transaction
from django.test import TestCase

from products.models import Product
from sales.models import Sale, SaleItem

from ..models import StoreLink


class StoreLinkTests(TestCase):
    def setUp(self):
        self.blue = Product.objects.create(name='ABC 클리커 (청축)')
        self.red = Product.objects.create(name='ABC 클리커 (적축)')
        self.base = StoreLink.objects.create(
            store_product_id='13860694961', store_name='ABC 키캡 클리커', product=self.blue
        )
        StoreLink.objects.create(
            store_product_id='13860694961', store_name='ABC 키캡 클리커', option='스위치: 적축', product=self.red
        )

    def test_option_text_picks_its_product_else_base(self):
        hit = StoreLink.resolve('13860694961', '글자: A / 스위치: 적축')
        self.assertEqual(hit.product, self.red)
        self.assertEqual(StoreLink.resolve('13860694961', '글자: A / 스위치: 청축'), self.base)
        self.assertEqual(StoreLink.resolve('13860694961', ''), self.base)

    def test_longest_option_wins(self):
        silent = Product.objects.create(name='ABC 클리커 (저소음 적축)')
        StoreLink.objects.create(
            store_product_id='13860694961', store_name='ABC 키캡 클리커', option='스위치: 적축 저소음', product=silent
        )
        self.assertEqual(StoreLink.resolve('13860694961', '스위치: 적축 저소음').product, silent)

    def test_unknown_product_and_preloaded_links(self):
        self.assertIsNone(StoreLink.resolve('999', '스위치: 적축'))
        links = list(StoreLink.objects.select_related('product'))
        with self.assertNumQueries(0):
            self.assertEqual(StoreLink.resolve('13860694961', '스위치: 적축', links).product, self.red)

    def test_one_row_per_product_and_option(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            StoreLink.objects.create(store_product_id='13860694961', store_name='중복', option='')

    def test_deleting_product_keeps_link_unlinked(self):
        self.blue.delete()
        self.base.refresh_from_db()
        self.assertIsNone(self.base.product)


class SaleItemStoreIdTests(TestCase):
    def test_store_item_id_unique_but_blank_allowed(self):
        sale = Sale.objects.create()
        SaleItem.objects.create(sale=sale, product_name='a', unit_price=1)
        SaleItem.objects.create(sale=sale, product_name='b', unit_price=1)  # 직접 넣은 줄은 빈 값 여러 개
        SaleItem.objects.create(sale=sale, product_name='c', unit_price=1, store_item_id='2026111094085851')
        with self.assertRaises(IntegrityError), transaction.atomic():
            SaleItem.objects.create(sale=sale, product_name='d', unit_price=1, store_item_id='2026111094085851')
