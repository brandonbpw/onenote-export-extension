# Changelog

## [1.1.0] - 2026-05-21

### Fixed
- Double messages in popup (background was forwarding messages popup already received)
- Content script now only runs in the `onenoteframe` URL to prevent duplicates
- Stop button works reliably via background state flag

### Changed
- PDF is now the default export format
- Version displayed in popup pulled from manifest automatically

## [1.0.0] - 2026-05-21

### Added
- Initial release
- Export all pages from all sections of a OneNote notebook
- HTML and PDF export formats
- Native PDF generation via Chrome debugger API (no external libraries)
- Debug panel to scan frames for OneNote content
- Configurable delay between page navigations
- Content cleaning (removes drag handles, resize handles, image overlays)
- Supports SharePoint-hosted OneNote (Doc.aspx iframe)
- Downloads organized into `OneNote Export/` folder
- Stop button with background-based state management
