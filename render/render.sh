#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Copyright (C) 2026 Josh Schullman
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Full 1920x1080 / 60fps render. Everything interesting lives in capture.js;
# this is just the one-liner you actually type.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${OUT:-out/periodic-table.mp4}"
node render/capture.js --out "$OUT" --fps 60 --crf "${CRF:-17}" "$@"
ls -lh "$OUT"
