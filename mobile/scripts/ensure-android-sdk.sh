#!/usr/bin/env bash

set -euo pipefail

ANDROID_SDK_ROOT="${HOME}/.local/android-sdk"
CMDLINE_TOOLS_DIR="${ANDROID_SDK_ROOT}/cmdline-tools"
LATEST_DIR="${CMDLINE_TOOLS_DIR}/latest"
ARCHIVE_PATH="${ANDROID_SDK_ROOT}/commandlinetools-linux.zip"
DOWNLOAD_URL="https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
jdk_home="$(${script_dir}/ensure-java17.sh)"

mkdir -p "${ANDROID_SDK_ROOT}" "${CMDLINE_TOOLS_DIR}"

if [[ ! -x "${LATEST_DIR}/bin/sdkmanager" ]]; then
  rm -rf "${LATEST_DIR}" "${CMDLINE_TOOLS_DIR}/tmp" "${ARCHIVE_PATH}"
  curl -fsSL "${DOWNLOAD_URL}" -o "${ARCHIVE_PATH}"
  unzip -q -o "${ARCHIVE_PATH}" -d "${CMDLINE_TOOLS_DIR}/tmp"
  mv "${CMDLINE_TOOLS_DIR}/tmp/cmdline-tools" "${LATEST_DIR}"
  rm -rf "${CMDLINE_TOOLS_DIR}/tmp"
fi

export ANDROID_SDK_ROOT
export ANDROID_HOME="${ANDROID_SDK_ROOT}"
export JAVA_HOME="${jdk_home}"
export PATH="${JAVA_HOME}/bin:${PATH}"
export PATH="${LATEST_DIR}/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

yes | sdkmanager --licenses >/dev/null || true
sdkmanager \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" >/dev/null

echo "${ANDROID_SDK_ROOT}"