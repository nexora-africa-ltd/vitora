#!/usr/bin/env bash

set -euo pipefail

JDK_DIR="${HOME}/.local/jdk"
JDK_NAME="temurin-17"
JDK_HOME="${JDK_DIR}/${JDK_NAME}"
ARCHIVE_PATH="${JDK_DIR}/OpenJDK17U-jdk_x64_linux_hotspot.tar.gz"
DOWNLOAD_URL="https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"

mkdir -p "${JDK_DIR}"

if [[ ! -x "${JDK_HOME}/bin/java" ]]; then
  rm -rf "${JDK_HOME}" "${JDK_DIR}/jdk-17"* "${ARCHIVE_PATH}"
  curl -fsSL "${DOWNLOAD_URL}" -o "${ARCHIVE_PATH}"
  tar -xzf "${ARCHIVE_PATH}" -C "${JDK_DIR}"

  extracted_dir="$(find "${JDK_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'jdk-17*' | head -n 1)"
  if [[ -z "${extracted_dir}" ]]; then
    echo "Unable to find extracted JDK 17 directory." >&2
    exit 1
  fi

  mv "${extracted_dir}" "${JDK_HOME}"
fi

echo "${JDK_HOME}"
