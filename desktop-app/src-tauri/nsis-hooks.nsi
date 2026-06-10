; Vitora HMIS — NSIS Installer Hooks
; Kills running Vitora processes before installation to prevent
; "Error opening file for writing" on locked binaries (e.g., node sidecar).

!macro NSIS_HOOK_PREINSTALL
  ; Kill the main Vitora HMIS app
  nsExec::ExecToLog 'taskkill /F /IM "Vitora HMIS.exe" /T'
  ; Kill the Node.js sidecar binary
  nsExec::ExecToLog 'taskkill /F /IM "node-x86_64-pc-windows-msvc.exe" /T'
  ; Brief pause to let file handles release
  Sleep 1000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; No post-install actions needed
!macroend
