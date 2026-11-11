# Credits

What Krevaya builds on, with each license. These parts keep their own licenses.
Settings links to the full notices at `/licenses/`; they're included in the built app.

- pdf-lib (MIT), https://github.com/Hopding/pdf-lib - PDF export
- fflate (MIT), https://github.com/101arrowz/fflate - zip files for multi-page downloads
- onnxruntime-web (MIT), Microsoft - runs the background removal model in the browser; its license and third-party notices are in `frontend/public/licenses/packages/`
- U^2-Net small (`u2netp.onnx`, Apache-2.0), Xuebin Qin et al., https://github.com/xuebinqin/U-2-Net - the ONNX file from [rembg's v0.0.0 release](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx), committed in `frontend/public/models/` with its license and source details in `NOTICE.txt`; it's never downloaded at build or run time
- rembg (MIT), Daniel Gatis, https://github.com/danielgatis/rembg - the cut-out worker follows its input and mask normalization; the license is in `frontend/public/models/rembg-LICENSE.txt`
- mediabunny (MPL-2.0), https://github.com/Vanilagy/mediabunny - MP4 and WebM muxing and WebCodecs encoding for video export; the build includes the installed version's source at `/licenses/mediabunny-source.zip`
- gifenc (MIT), https://github.com/mattdesl/gifenc - GIF encoding and color quantizing for GIF export
- Five built-in sounds (`frontend/src/audio/`): Slow sketch and Line work (music loops), Paper lift, Small signal and Last mark (short cues). Their recipes were written for Krevaya and are synthesised in the browser, released as CC0
- Tabler Icons (via @iconify-json/tabler), Paweł Kuna, MIT, https://github.com/tabler/tabler-icons
- Phosphor Icons (via @iconify-json/ph), Phosphor Icons, MIT, https://github.com/phosphor-icons/core
- Material Design Icons (via @iconify-json/mdi), Pictogrammers, Apache-2.0, https://github.com/Templarian/MaterialDesign
- Remix Icon (via @iconify-json/ri), Remix Design, Apache-2.0, https://github.com/cyberalien/RemixIcon - the Apache-licensed set used by this Iconify package
- Carbon Icons (via @iconify-json/carbon), IBM, Apache-2.0, https://github.com/carbon-design-system/carbon
- Lucide (via @iconify-json/lucide), Lucide Contributors, ISC and MIT, https://github.com/lucide-icons/lucide - includes the original Feather notice
- Fluent Emoji Flat (via @iconify-json/fluent-emoji-flat), Microsoft, MIT, https://github.com/microsoft/fluentui-emoji
- uqr (QR code encoder), Anthony Fu and Project Nayuki, MIT, https://github.com/unjs/uqr
- Google Fonts catalog families (backend/app/content/fonts.py), their designers, SIL OFL 1.1 or Apache-2.0, files from Fontsource 5.3.0 (https://fontsource.org), in `backend/app/content/font_files/`; each family has its full notice in `LICENSE.txt`
- Template sample photos in backend/app/content/template_images/ were made for this project and are released under CC0
- papaparse (MIT), https://github.com/mholt/PapaParse - reads the CSV and TSV files for bulk copies
- Floating UI (@floating-ui/react, MIT), https://github.com/floating-ui/floating-ui - positions menus and flyouts
- The Krevaya name and logo (`frontend/public/logo-mark.png`, `favicon.png`, `apple-touch-icon.png`, `docs/images/logo-*.png`) are trademarks. They're not under the AGPL; forks that are hosted should use their own

The icon notices are in `frontend/public/licenses/icons/`. The build also collects the licenses of the
installed frontend runtime packages, including dependencies used by workers and fonts loaded as files.
