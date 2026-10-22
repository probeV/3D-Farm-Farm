from django.contrib import admin

from .models import Category, CostSetting, Part, Product, ProductFilament, ProductPart, Subcategory


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


@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ['name', 'shop', 'price', 'pack_qty', 'unit', 'unit_price']
    search_fields = ['name', 'shop']

    @admin.display(description='개당 단가')
    def unit_price(self, obj):
        return obj.unit_price


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
    list_display = ['no', 'name', 'category', 'subcategory', 'status', 'print_minutes', 'sale_price']
    list_display_links = ['no', 'name']
    list_filter = ['status', 'category']
    search_fields = ['name']
    list_select_related = ['category', 'subcategory__category']
    autocomplete_fields = ['category', 'subcategory']
    inlines = [ProductFilamentInline, ProductPartInline]

    def get_search_results(self, request, queryset, search_term):
        """제품명 검색에 더해, 숫자를 넣으면 No. 로도 찾기"""
        results, may_have_duplicates = super().get_search_results(request, queryset, search_term)
        if search_term.strip().isdigit():
            results |= queryset.filter(no=int(search_term))
        return results, may_have_duplicates


@admin.register(CostSetting)
class CostSettingAdmin(admin.ModelAdmin):
    """설정은 1개 행만: 이미 있으면 추가 불가, 삭제 불가"""

    def has_add_permission(self, request):
        return not CostSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
