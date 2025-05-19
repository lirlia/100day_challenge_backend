#include <efi.h>
// #include <efilib.h> // efilib.hへの依存を削除

EFI_STATUS
EFIAPI
efi_main (EFI_HANDLE ImageHandle, EFI_SYSTEM_TABLE *SystemTable)
{
    // InitializeLib(ImageHandle, SystemTable); // efilib.hの関数なので削除
    SystemTable->ConOut->OutputString(SystemTable->ConOut, L"Hello from UEFI (manual)!\r\n");

    // ここでカーネルをロードして実行する処理を将来的に追加

    SystemTable->ConOut->OutputString(SystemTable->ConOut, L"Press any key to exit...\r\n");
    EFI_INPUT_KEY Key;
    SystemTable->ConIn->Reset(SystemTable->ConIn, FALSE);
    while ((SystemTable->ConIn->ReadKeyStroke(SystemTable->ConIn, &Key)) == EFI_NOT_READY);

    return EFI_SUCCESS;
}
