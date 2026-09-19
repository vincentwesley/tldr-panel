# Third-party notices

TL;DR Panel bundles the following third-party software in its built extension (`extract.js`).

## @mozilla/readability

- Project: https://github.com/mozilla/readability
- Copyright (c) Mozilla Foundation and contributors
- License: Apache License, Version 2.0

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
software except in compliance with the License. You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the
License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
either express or implied. See the License for the specific language governing permissions
and limitations under the License.

Readability is used unmodified. It is derived from Arc90's Readability, which was also
licensed under the Apache License 2.0.

The full text of the Apache License 2.0 is available at
https://www.apache.org/licenses/LICENSE-2.0.txt and is included with the
`@mozilla/readability` npm package (`node_modules/@mozilla/readability/LICENSE.md`).

Development-only tools (esbuild, Vitest, Playwright, ESLint, jsdom, adm-zip) are not
shipped in the extension.
