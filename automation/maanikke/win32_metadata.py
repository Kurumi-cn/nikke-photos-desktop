"""Read process-token metadata; never changes token privileges."""
import ctypes
from ctypes import wintypes

def elevation(pid):
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    advapi=ctypes.WinDLL('advapi32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    advapi.OpenProcessToken.argtypes=[wintypes.HANDLE,wintypes.DWORD,ctypes.POINTER(wintypes.HANDLE)]
    advapi.GetTokenInformation.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD)]
    process=kernel.OpenProcess(0x1000,False,pid)
    if not process:return None
    token=wintypes.HANDLE()
    try:
        if not advapi.OpenProcessToken(process,0x0008,ctypes.byref(token)):return None
        value=wintypes.DWORD();length=wintypes.DWORD()
        if not advapi.GetTokenInformation(token,20,ctypes.byref(value),ctypes.sizeof(value),ctypes.byref(length)):return None
        return bool(value.value)
    finally:
        if token:kernel.CloseHandle(token)
        kernel.CloseHandle(process)
