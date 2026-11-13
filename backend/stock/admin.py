from django.contrib import admin

from .models import PackSet, PackSetLine, Part, PartCategory, StockHistory


@admin.register(PartCategory)
class PartCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind']
    list_filter = ['kind']
    search_fields = ['name']


class StockHistoryInline(admin.TabularInline):
    """입출고 기록은 보기만 (남은 수량과 함께 바꿔야 해서 화면 · API 의 조정으로)"""

    model = StockHistory
    fk_name = 'part'
    extra = 0
    fields = ['date', 'kind', 'qty', 'after', 'note', 'sale']
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ['name', 'kind', 'category', 'shop', 'price', 'pack_qty', 'unit', 'unit_price', 'stock', 'alert']
    list_filter = ['kind', 'category']
    search_fields = ['name', 'shop']
    # 남은 수량은 입출고 기록과 함께 바꿔야 해서 여기서는 보기만
    readonly_fields = ['stock']
    inlines = [StockHistoryInline]

    @admin.display(description='개당 단가')
    def unit_price(self, obj):
        return obj.unit_price


class PackSetLineInline(admin.TabularInline):
    model = PackSetLine
    extra = 0
    autocomplete_fields = ['part']


@admin.register(PackSet)
class PackSetAdmin(admin.ModelAdmin):
    search_fields = ['name']
    inlines = [PackSetLineInline]
