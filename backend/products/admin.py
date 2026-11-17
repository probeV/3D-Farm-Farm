from django.contrib import admin

from .models import Category, CostSetting, Product, ProductFilament, ProductPart, Subcategory


class SubcategoryInline(admin.TabularInline):
    model = Subcategory
    extra = 0


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    search_fields = ['name']
    inlines = [SubcategoryInline]


@admin.register(Subcategory)
class SubcategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category']
    list_filter = ['category']
    search_fields = ['name', 'category__name']
    list_select_related = ['category']


class ProductFilamentInline(admin.TabularInline):
    model = ProductFilament
    extra = 0
    autocomplete_fields = ['filament', 'color']


class ProductPartInline(admin.TabularInline):
    model = ProductPart
    extra = 0
    autocomplete_fields = ['part']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'subcategory', 'status', 'print_minutes', 'sale_price']
    list_display_links = ['name']
    list_filter = ['status', 'category']
    search_fields = ['name']
    list_select_related = ['category', 'subcategory__category']
    autocomplete_fields = ['category', 'subcategory', 'default_pack']
    inlines = [ProductFilamentInline, ProductPartInline]


@admin.register(CostSetting)
class CostSettingAdmin(admin.ModelAdmin):
    """설정은 1개 행만: 이미 있으면 추가 불가, 삭제 불가"""

    def has_add_permission(self, request):
        return not CostSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
