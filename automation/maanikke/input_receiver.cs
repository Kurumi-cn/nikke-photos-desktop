using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Collections.Generic;

// One top-level native receiver avoids toolkit child-window routing differences.
public sealed class PhotosInputReceiver : Form {
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr value);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr value,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr value,System.Text.StringBuilder text,int length);
 readonly string folder,nonce; readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly Timer timer=new Timer(); readonly Stopwatch clock=Stopwatch.StartNew();
 readonly List<object> events=new List<object>(); readonly Rectangle target=new Rectangle(140,150,360,90);
 int downs,ups,activated;bool pressed,ready;
 PhotosInputReceiver(string dir,string id){
  folder=dir;nonce=id;Text="NIKKE Photos Input Test "+nonce;
  AutoScaleMode=AutoScaleMode.None;ClientSize=new Size(640,360);StartPosition=FormStartPosition.Manual;Location=new Point(100,100);
  BackColor=Color.FromArgb(24,32,48);ForeColor=Color.White;DoubleBuffered=true;
  timer.Interval=100;timer.Tick+=(s,e)=>{
   var request=Path.Combine(folder,"foreground-request.json");
   if(File.Exists(request)){
    try{
     var data=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(request));
     var hwnd=new IntPtr(long.Parse(data["hwnd"]));uint pid;GetWindowThreadProcessId(hwnd,out pid);
     var title=new System.Text.StringBuilder(256);GetWindowText(hwnd,title,256);
     if(pid==uint.Parse(data["pid"])&&title.ToString()=="NIKKE Photos Input Test "+data["nonce"])SetForegroundWindow(hwnd);
    }finally{File.Delete(request);}
   }
   if(File.Exists(Path.Combine(folder,"stop"))||clock.Elapsed.TotalSeconds>60)Close();
  };
 }
 void Save(){
  var value=new {pid=Process.GetCurrentProcess().Id,nonce=nonce,down=downs,up=ups,activated=activated,events=events,hwnd=Handle.ToInt64().ToString(),title=Text,point=new int[]{320,195}};
  var file=Path.Combine(folder,"state.json");File.WriteAllText(file+".next",json.Serialize(value));File.Copy(file+".next",file,true);
 }
 protected override void OnShown(EventArgs e){base.OnShown(e);ready=true;Save();timer.Start();}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;
  g.DrawString("NIKKE Photos - independent Win32 receiver",new Font("Segoe UI",16),Brushes.White,20,25);
  g.DrawString("One SendMessageWithCursorPos click; no game input",new Font("Segoe UI",11),Brushes.LightGray,20,80);
  g.FillRectangle(Brushes.SteelBlue,target);g.DrawString("Test button",new Font("Segoe UI",18),Brushes.White,240,178);
  g.DrawString("DOWN "+downs+" / UP "+ups+" / activated "+activated,new Font("Segoe UI",14),Brushes.LightGreen,50,285);
 }
 protected override void WndProc(ref Message m){
  if(ready&&(m.Msg==0x201||m.Msg==0x202)){
   int x=(short)((long)m.LParam&65535),y=(short)(((long)m.LParam>>16)&65535);
   events.Add(new {type=m.Msg==0x201?"down":"up",x=x,y=y,ms=clock.Elapsed.TotalMilliseconds});
   if(m.Msg==0x201){downs++;pressed=target.Contains(x,y);}
   else {ups++;if(pressed&&target.Contains(x,y))activated++;pressed=false;}
   Save();Invalidate();
  }
  base.WndProc(ref m);
 }
 [STAThread] public static void Run(string dir,string id){SetThreadDpiAwarenessContext(new IntPtr(-4));Application.EnableVisualStyles();Application.Run(new PhotosInputReceiver(dir,id));}
}
