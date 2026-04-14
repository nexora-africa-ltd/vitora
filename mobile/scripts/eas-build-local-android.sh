#!/usr/bin/env bash

set -euo pipefail

profile="preview"
upload_after_build="false"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--upload)
			upload_after_build="true"
			shift
			;;
		--help|-h)
			cat <<'EOF'
Usage: ./scripts/eas-build-local-android.sh [profile] [--upload]

Arguments:
	profile    EAS build profile to use. Defaults to preview.

Options:
	--upload   Upload the newest generated APK to gdrive:/apks using rclone.
EOF
			exit 0
			;;
		*)
			profile="$1"
			shift
			;;
	esac
done

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

if [[ "${upload_after_build}" == "true" ]]; then
	latest_apk="$(find "${project_dir}" -maxdepth 1 -type f -name 'build-*.apk' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

	if [[ -z "${latest_apk}" ]]; then
		echo "No local APK was found to upload." >&2
		exit 1
	fi

	command -v rclone >/dev/null 2>&1 || {
		echo "rclone is required for --upload." >&2
		exit 1
	}

	rclone copy "${latest_apk}" gdrive:/apks
	echo "Uploaded ${latest_apk} to gdrive:/apks"
fi
