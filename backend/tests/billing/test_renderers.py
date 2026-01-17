"""Tests for billing renderers (CSV, XLSX)."""

import pytest

from hmis.apps.billing.renderers import CSVRenderer, XLSXRenderer


class TestCSVRenderer:
    """Tests for CSVRenderer."""

    def test_csv_renderer_media_type(self):
        """CSVRenderer should have correct media type."""
        renderer = CSVRenderer()
        assert renderer.media_type == "text/csv"
        assert renderer.format == "csv"
        assert renderer.charset == "utf-8"

    def test_render_none_returns_empty_bytes(self):
        """Rendering None should return empty bytes."""
        renderer = CSVRenderer()
        result = renderer.render(None)
        assert result == b""

    def test_render_bytes_returns_bytes(self):
        """Rendering bytes should return the same bytes."""
        renderer = CSVRenderer()
        data = b"col1,col2\nval1,val2"
        result = renderer.render(data)
        assert result == data

    def test_render_bytearray_returns_bytes(self):
        """Rendering bytearray should return bytes."""
        renderer = CSVRenderer()
        data = bytearray(b"col1,col2\nval1,val2")
        result = renderer.render(data)
        assert result == bytes(data)

    def test_render_string_returns_encoded_bytes(self):
        """Rendering a string should return UTF-8 encoded bytes."""
        renderer = CSVRenderer()
        data = "col1,col2\nval1,val2"
        result = renderer.render(data)
        assert result == data.encode("utf-8")

    def test_render_other_types_converts_to_string(self):
        """Rendering other types should convert to string then bytes."""
        renderer = CSVRenderer()
        data = {"key": "value"}
        result = renderer.render(data)
        assert result == str(data).encode("utf-8")

    def test_render_with_context(self):
        """Rendering with context should still work."""
        renderer = CSVRenderer()
        data = "test data"
        result = renderer.render(
            data,
            accepted_media_type="text/csv",
            renderer_context={"view": None},
        )
        assert result == data.encode("utf-8")


class TestXLSXRenderer:
    """Tests for XLSXRenderer."""

    def test_xlsx_renderer_media_type(self):
        """XLSXRenderer should have correct media type."""
        renderer = XLSXRenderer()
        assert (
            renderer.media_type
            == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert renderer.format == "xlsx"

    def test_render_none_returns_empty_bytes(self):
        """Rendering None should return empty bytes."""
        renderer = XLSXRenderer()
        result = renderer.render(None)
        assert result == b""

    def test_render_bytes_returns_bytes(self):
        """Rendering bytes should return the same bytes."""
        renderer = XLSXRenderer()
        data = b"\x50\x4b\x03\x04"  # XLSX magic bytes
        result = renderer.render(data)
        assert result == data

    def test_render_bytearray_returns_bytes(self):
        """Rendering bytearray should return bytes."""
        renderer = XLSXRenderer()
        data = bytearray(b"\x50\x4b\x03\x04")
        result = renderer.render(data)
        assert result == bytes(data)

    def test_render_string_returns_encoded_bytes(self):
        """Rendering a string should return UTF-8 encoded bytes."""
        renderer = XLSXRenderer()
        data = "some string data"
        result = renderer.render(data)
        assert result == data.encode("utf-8")

    def test_render_other_types_converts_to_string(self):
        """Rendering other types should convert to string then bytes."""
        renderer = XLSXRenderer()
        data = [1, 2, 3]
        result = renderer.render(data)
        assert result == str(data).encode("utf-8")

    def test_render_with_context(self):
        """Rendering with context should still work."""
        renderer = XLSXRenderer()
        data = b"xlsx content"
        result = renderer.render(
            data,
            accepted_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            renderer_context={"view": None},
        )
        assert result == data
