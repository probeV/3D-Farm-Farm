import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image


def make_image(name='logo.png', size=(600, 300), image_format='PNG'):
    """테스트용 이미지 업로드 파일"""
    buffer = BytesIO()
    Image.new('RGB', size, '#2f6fed').save(buffer, format=image_format)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f'image/{image_format.lower()}')


def image_size(field_file):
    with Image.open(field_file.path) as image:
        return image.size


class TempMediaMixin:
    """업로드 파일을 진짜 media/ 대신 임시 폴더에 쓰고, 테스트가 끝나면 지운다"""

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp()
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_root)
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)
