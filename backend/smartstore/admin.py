from django.contrib import admin

from .models import StoreImport, StoreLink


@admin.register(StoreLink)
class StoreLinkAdmin(admin.ModelAdmin):
    list_display = ['store_name', 'store_product_id', 'option', 'product', 'updated_at']
    search_fields = ['store_name', 'store_product_id', 'option']
    autocomplete_fields = ['product']


@admin.register(StoreImport)
class StoreImportAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'date_from', 'date_to', 'added', 'updated', 'skipped', 'note']
