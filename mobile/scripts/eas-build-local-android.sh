#!/usr/bin/env bash

set -euo pipefail

profile="${1:-preview}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
jdk_home="$(${script_dir}/ensure-java17.sh)"
android_sdk_root="$(${script_dir}/ensure-android-sdk.sh)"

export JAVA_HOME="${jdk_home}"
export PATH="${JAVA_HOME}/bin:${PATH}"
export ANDROID_SDK_ROOT="${android_sdk_root}"
export ANDROID_HOME="${android_sdk_root}"
export PATH="${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

cd "${project_dir}"

java -version
npx sdkmanager --version >/dev/null 2>&1 || true
npx eas build --platform android --profile "${profile}" --local