// Native Windows Graphics Capture, compiled in memory by Windows PowerShell.
// No input injection, cursor state changes, pixel retouching, scaling or cropping.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;

public static class NikkeWindowsCapture {
    [ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IItemInterop {
        IntPtr CreateForWindow(IntPtr window, ref Guid iid);
        IntPtr CreateForMonitor(IntPtr monitor, ref Guid iid);
    }
    [ComImport, Guid("905a0fef-bc53-11df-8c49-001e4fc686da"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IBufferBytes { IntPtr Buffer(); }
    [DllImport("d3d11.dll", ExactSpelling=true)]
    static extern int D3D11CreateDevice(IntPtr adapter, int driver, IntPtr software, uint flags, IntPtr levels, uint count, uint sdk, out IntPtr device, out int level, out IntPtr context);
    [DllImport("d3d11.dll", ExactSpelling=true)]
    static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr device);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    static void Validate(IntPtr window, uint expectedPid) {
        uint current; GetWindowThreadProcessId(window, out current);
        if (!IsWindow(window) || current != expectedPid) throw new InvalidOperationException("WINDOW_CHANGED: selected window closed or changed owner");
        if (IsIconic(window)) throw new InvalidOperationException("WINDOW_MINIMIZED: restore the game without needing foreground focus");
    }
    static IDirect3DDevice CreateDevice() {
        IntPtr d3d=IntPtr.Zero, context=IntPtr.Zero, dxgi=IntPtr.Zero, inspectable=IntPtr.Zero;
        try {
            int level;
            Marshal.ThrowExceptionForHR(D3D11CreateDevice(IntPtr.Zero,1,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out d3d,out level,out context));
            Guid iid=new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(d3d,ref iid,out dxgi));
            Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi,out inspectable));
            return (IDirect3DDevice)Marshal.GetObjectForIUnknown(inspectable);
        } finally {
            foreach(var ptr in new[]{inspectable,dxgi,context,d3d}) if(ptr!=IntPtr.Zero)Marshal.Release(ptr);
        }
    }
    public static string Capture(long handle, uint pid, bool includeCursor) {
        if(!GraphicsCaptureSession.IsSupported())throw new NotSupportedException("WGC_UNSUPPORTED");
        if(!Windows.Foundation.Metadata.ApiInformation.IsPropertyPresent("Windows.Graphics.Capture.GraphicsCaptureSession","IsCursorCaptureEnabled"))throw new NotSupportedException("CURSOR_CONTROL_UNSUPPORTED: Windows 10 2004 or later required");
        IntPtr window=new IntPtr(handle);Validate(window,pid);
        var factory=(IItemInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
        Guid itemId=new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
        IntPtr ptr=factory.CreateForWindow(window,ref itemId);
        GraphicsCaptureItem item;
        try {item=(GraphicsCaptureItem)Marshal.GetObjectForIUnknown(ptr);} finally {Marshal.Release(ptr);}
        using(var device=CreateDevice())
        using(var pool=Direct3D11CaptureFramePool.CreateFreeThreaded(device,DirectXPixelFormat.B8G8R8A8UIntNormalized,2,item.Size))
        using(var session=pool.CreateCaptureSession(item)) {
            session.IsCursorCaptureEnabled=includeCursor;
            if(session.IsCursorCaptureEnabled!=includeCursor)throw new InvalidOperationException("CURSOR_CONTROL_REJECTED");
            session.StartCapture();
            var poolSize=item.Size;
            var timer=Stopwatch.StartNew();
            while(timer.ElapsedMilliseconds<8000) {
                Validate(window,pid);
                var frame=pool.TryGetNextFrame();
                if(frame==null){Thread.Sleep(15);continue;}
                if(frame.ContentSize.Width!=poolSize.Width || frame.ContentSize.Height!=poolSize.Height) {
                    using(frame) {poolSize=frame.ContentSize;}
                    pool.Recreate(device,DirectXPixelFormat.B8G8R8A8UIntNormalized,2,poolSize);
                    continue;
                }
                using(frame) {
                    var operation=SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface);
                    while(operation.Status==Windows.Foundation.AsyncStatus.Started) {
                        if(timer.ElapsedMilliseconds>=8000){operation.Cancel();throw new TimeoutException("SURFACE_COPY_TIMEOUT");}
                        Thread.Sleep(5);
                    }
                    using(var bitmap=operation.GetResults()) {
                        int width=bitmap.PixelWidth, height=bitmap.PixelHeight;
                        if(width<frame.ContentSize.Width || height<frame.ContentSize.Height)throw new InvalidOperationException("WINDOW_RESIZED: surface smaller than content");
                        if(bitmap.BitmapPixelFormat!=BitmapPixelFormat.Bgra8)throw new InvalidOperationException("UNEXPECTED_PIXEL_FORMAT");
                        byte[] pixels=new byte[checked(width*height*4)];
                        var buffer=new Windows.Storage.Streams.Buffer((uint)pixels.Length);
                        bitmap.CopyToBuffer(buffer);
                        Marshal.Copy(((IBufferBytes)(object)buffer).Buffer(),pixels,0,pixels.Length);
                        using(var image=new Bitmap(width,height,PixelFormat.Format32bppRgb)) {
                            var locked=image.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppRgb);
                            try {for(int y=0;y<height;y++)Marshal.Copy(pixels,y*width*4,IntPtr.Add(locked.Scan0,y*locked.Stride),width*4);} finally {image.UnlockBits(locked);}
                            using(var bytes=new MemoryStream()) {
                                image.Save(bytes,ImageFormat.Png);
                                Validate(window,pid);
                                return "{\"backend\":\"windows-graphics-capture\",\"cursor\":\""+(includeCursor?"always":"never")+"\",\"contentWidth\":"+frame.ContentSize.Width+",\"contentHeight\":"+frame.ContentSize.Height+",\"width\":"+width+",\"height\":"+height+",\"dataUrl\":\"data:image/png;base64,"+Convert.ToBase64String(bytes.ToArray())+"\"}";
                            }
                        }
                    }
                }
            }
            throw new TimeoutException("FRAME_TIMEOUT: no new window frame within 8 seconds");
        }
    }
}
