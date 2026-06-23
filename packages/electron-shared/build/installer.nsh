; Visual C++ 2015-2022 x64 재배포 패키지 자동 설치.
;
; 배경: TutorMate의 AI 엔진(llama-server.exe)은 MSVCP140.dll에 의존한다.
; VC++ Redist 없는 윈도우(특히 새 PC·VM)에서는 엔진이 0xC0000005로 즉사하므로
; 인스톨러가 알아서 깔아준다. /quiet 무인 설치라 사용자에게 추가 UI는 안 뜸.
;
; 이미 깔린 시스템은 레지스트리 키로 감지해 skip.
; vc_redist.x64.exe 파일은 빌드 직전 scripts/fetch-vc-redist.sh가 build/에 받아둠.

!macro customInstall
  ; 레지스트리 키로 설치 확인 — VS 2015~2022 시리즈 공통 키(14.0)
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    DetailPrint "Visual C++ 재배포 패키지 이미 설치됨 — 건너뜀"
  ${Else}
    DetailPrint "Visual C++ 재배포 패키지 설치 중..."
    SetOutPath "$PLUGINSDIR"
    File "/oname=vc_redist.x64.exe" "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
    ; /quiet = UI 없음, /norestart = 재부팅 보류(앱 재시작만으로 보통 충분)
    ExecWait '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart' $1
    ; exit code 0=성공, 1638=이미 동일 이상 버전, 3010=성공+재부팅필요 → 모두 OK
    ${If} $1 == 0
      DetailPrint "Visual C++ 재배포 패키지 설치 완료"
    ${ElseIf} $1 == 1638
      DetailPrint "Visual C++ 재배포 패키지 이미 설치되어 있음"
    ${ElseIf} $1 == 3010
      DetailPrint "Visual C++ 재배포 패키지 설치 완료 (재부팅 권장)"
    ${Else}
      DetailPrint "Visual C++ 재배포 패키지 설치 실패 (code $1) — 앱이 알아서 다시 시도합니다"
    ${EndIf}
  ${EndIf}
!macroend
