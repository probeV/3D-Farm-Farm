from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from .models import Brand, Color, Filament, Material, Spool, normalize_hex


class HexTests(TestCase):
    def test_normalize_accepts_with_or_without_hash(self):
        self.assertEqual(normalize_hex('f5f5f5'), '#F5F5F5')
        self.assertEqual(normalize_hex(' #a1b2c3 '), '#A1B2C3')

    def test_normalize_rejects_bad_format(self):
        for bad in ['', '#FFF', 'GGGGGG', '#1234567']:
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                normalize_hex(bad)


class FilamentModelTests(TestCase):
    def setUp(self):
        self.bambu = Brand.objects.create(name='Bambu Lab')
        self.pla = Material.objects.create(name='PLA')
        self.filament = Filament.objects.create(
            brand=self.bambu,
            material=self.pla,
            series='Matte',
            price=Decimal('20000'),
        )

    def test_display_name(self):
        self.assertEqual(self.filament.display_name, 'Bambu Lab › PLA Matte')
        esun = Brand.objects.create(name='Esun')
        petg = Material.objects.create(name='PETG')
        self.assertEqual(Filament(brand=esun, material=petg).display_name, 'Esun › PETG')

    def test_default_spool_weight(self):
        self.assertEqual(self.filament.spool_g, 1000)

    def test_same_brand_material_series_is_unique(self):
        with self.assertRaises(IntegrityError):
            Filament.objects.create(brand=self.bambu, material=self.pla, series='Matte')

    def test_empty_series_is_also_unique(self):
        Filament.objects.create(brand=self.bambu, material=self.pla)
        with self.assertRaises(IntegrityError):
            Filament.objects.create(brand=self.bambu, material=self.pla)

    def test_color_hex_saved_normalized(self):
        color = Color.objects.create(filament=self.filament, name='화이트', hex='f5f5f5')
        self.assertEqual(color.hex, '#F5F5F5')

    def test_color_name_unique_within_filament(self):
        Color.objects.create(filament=self.filament, name='화이트', hex='#FFFFFF')
        with self.assertRaises(IntegrityError):
            Color.objects.create(filament=self.filament, name='화이트', hex='#F5F5F5')

    def test_color_price_falls_back_to_filament(self):
        color = Color(filament=self.filament, name='블랙', hex='#000000')
        self.assertEqual(color.spool_price, Decimal('20000'))
        self.assertEqual(color.price_per_g, Decimal('20'))
        color.price = Decimal('25000')
        self.assertEqual(color.spool_price, Decimal('25000'))
        self.assertEqual(color.price_per_g, Decimal('25'))

    def test_price_per_g_is_none_without_any_price(self):
        self.filament.price = None
        color = Color(filament=self.filament, name='블랙', hex='#000000')
        self.assertIsNone(color.price_per_g)

    def test_delete_protection(self):
        color = Color.objects.create(filament=self.filament, name='화이트', hex='#FFFFFF')
        Spool.objects.create(color=color)
        for obj in [self.bambu, self.pla, self.filament, color]:
            with self.subTest(obj=obj), transaction.atomic(), self.assertRaises(ProtectedError):
                obj.delete()


class SpoolTests(TestCase):
    NOW = datetime(2026, 10, 1, 3, 0, tzinfo=dt_timezone.utc)
    LATER = datetime(2026, 10, 5, 3, 0, tzinfo=dt_timezone.utc)

    def setUp(self):
        filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'),
            material=Material.objects.create(name='PLA'),
        )
        self.color = Color.objects.create(filament=filament, name='화이트', hex='#FFFFFF')

    def test_code_from_code_no(self):
        self.assertEqual(Spool(code_no=12).code, 'S00012')
        self.assertEqual(Spool(code_no=123456).code, 'S123456')

    def test_unsaved_spool_has_no_code(self):
        self.assertIsNone(Spool().code)
        self.assertEqual(str(Spool()), '(새 스풀)')

    def test_created_spools_get_next_numbers(self):
        first = Spool.objects.create(color=self.color)
        second = Spool.objects.create(color=self.color)
        self.assertEqual((first.code, second.code), ('S00001', 'S00002'))
        self.assertEqual(first.status, Spool.Status.SEALED)

    def test_code_no_is_independent_of_id(self):
        spool = Spool.objects.create(color=self.color, code_no=500)
        self.assertNotEqual(spool.pk, 500)
        self.assertEqual(spool.code, 'S00500')
        self.assertEqual(Spool.objects.create(color=self.color).code_no, 501)

    def test_code_kept_on_later_save(self):
        spool = Spool.objects.create(color=self.color)
        spool.note = '메모'
        spool.save()
        spool.refresh_from_db()
        self.assertEqual(spool.code, 'S00001')

    def test_deleted_number_can_be_registered_again(self):
        first = Spool.objects.create(color=self.color)
        Spool.objects.create(color=self.color)
        first.delete()
        self.assertEqual(Spool.objects.create(color=self.color, code_no=1).code, 'S00001')

    def test_code_no_must_be_positive(self):
        with self.assertRaises(ValidationError):
            Spool(color=self.color, code_no=0).full_clean()

    def test_duplicate_code_no_rejected(self):
        Spool.objects.create(color=self.color, code_no=7)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Spool.objects.create(color=self.color, code_no=7)

    def test_bulk_create_needs_code_no(self):
        # bulk_create 는 save() 를 거치지 않으므로 번호를 직접 넣어야 한다
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Spool.objects.bulk_create([Spool(color=self.color)])
        start = Spool.next_code_no()
        Spool.objects.bulk_create([Spool(color=self.color, code_no=start + i) for i in range(3)])
        self.assertEqual([s.code for s in Spool.objects.all()], ['S00001', 'S00002', 'S00003'])

    def test_code_no_from_code(self):
        self.assertEqual(Spool.code_no_from_code('S00012'), 12)
        self.assertEqual(Spool.code_no_from_code(' s12 '), 12)
        self.assertEqual(Spool.code_no_from_code('S123456'), 123456)

    def test_code_no_from_code_rejects_bad_format(self):
        for bad in ['', None, '12', 'X00012', 'S', 'S12a']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                Spool.code_no_from_code(bad)

    def test_open_sets_opened_at_once(self):
        spool = Spool(color=self.color)
        spool.set_status('open', now=self.NOW)
        self.assertEqual((spool.status, spool.opened_at, spool.finished_at), ('open', self.NOW, None))
        spool.set_status('open', now=self.LATER)
        self.assertEqual(spool.opened_at, self.NOW)

    def test_finish_keeps_opened_at_and_sets_finished_at(self):
        spool = Spool(color=self.color)
        spool.set_status('open', now=self.NOW)
        spool.set_status('empty', now=self.LATER)
        self.assertEqual((spool.opened_at, spool.finished_at), (self.NOW, self.LATER))

    def test_finish_from_sealed_sets_both_dates(self):
        spool = Spool(color=self.color)
        spool.set_status('empty', now=self.NOW)
        self.assertEqual((spool.opened_at, spool.finished_at), (self.NOW, self.NOW))

    def test_back_to_open_clears_finished_at(self):
        spool = Spool(color=self.color)
        spool.set_status('empty', now=self.NOW)
        spool.set_status('open', now=self.LATER)
        self.assertEqual((spool.opened_at, spool.finished_at), (self.NOW, None))

    def test_back_to_sealed_clears_dates(self):
        spool = Spool(color=self.color)
        spool.set_status('empty', now=self.NOW)
        spool.set_status('sealed')
        self.assertEqual((spool.status, spool.opened_at, spool.finished_at), ('sealed', None, None))

    def test_unknown_status_rejected(self):
        with self.assertRaises(ValueError):
            Spool(color=self.color).set_status('lost')


class AdminPagesTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User

        self.client.force_login(User.objects.create_superuser('admin', password='x'))
        filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'),
            material=Material.objects.create(name='PLA'),
        )
        self.color = Color.objects.create(filament=filament, name='화이트', hex='#FFFFFF')
        self.spool = Spool.objects.create(color=self.color)
        Spool.objects.create(color=self.color)

    def test_spool_search_by_code(self):
        res = self.client.get('/admin/filaments/spool/', {'q': self.spool.code})
        self.assertEqual(list(res.context['cl'].result_list), [self.spool])

    def add_spool(self, code_no):
        return self.client.post(
            '/admin/filaments/spool/add/',
            {'color': self.color.pk, 'code_no': code_no, 'status': 'sealed', 'purchased_at': '2026-10-20'},
        )

    def test_admin_add_with_blank_number_gets_next(self):
        self.assertEqual(self.add_spool('').status_code, 302)
        self.assertTrue(Spool.objects.filter(code_no=3).exists())

    def test_admin_add_with_chosen_number(self):
        self.assertEqual(self.add_spool('500').status_code, 302)
        self.assertTrue(Spool.objects.filter(code_no=500).exists())

    def test_admin_add_with_used_number_shows_error(self):
        res = self.add_spool(str(self.spool.code_no))
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, '이미 쓰고 있는 스풀 번호예요.')

    def test_changelist_and_add_pages_render(self):
        for model in ['brand', 'material', 'filament', 'color', 'spool']:
            for page in ['', 'add/']:
                with self.subTest(model=model, page=page):
                    res = self.client.get(f'/admin/filaments/{model}/{page}')
                    self.assertEqual(res.status_code, 200)
