from django.contrib import admin

from .models import Sale, SaleItem, SalePack, SalePart


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    autocomplete_fields = ['product']


class SalePartInline(admin.TabularInline):
    model = SalePart
    extra = 0
    autocomplete_fields = ['part']


class SalePackInline(admin.TabularInline):
    model = SalePack
    extra = 0
    autocomplete_fields = ['part']


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ['date', 'channel', 'order_no', 'shipping_received', 'fee']
    list_filter = ['channel']
    search_fields = ['order_no', 'note', 'items__product_name']
    date_hierarchy = 'date'
    inlines = [SaleItemInline, SalePartInline, SalePackInline]
