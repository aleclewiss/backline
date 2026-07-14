// DragHelper.exe <file> - shows a small always-on-top "grab chip" at the
// cursor. Dragging the chip starts a native OLE file drag from OUR OWN
// window (the only fully reliable way on Windows), droppable straight onto
// Ableton tracks. Chip disappears after the drop, on Esc/right-click, or
// after 30s idle. Own process: can never freeze the window manager.
using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    static string logPath;
    static void Log(string msg)
    {
        try { File.AppendAllText(logPath, DateTime.Now.ToString("HH:mm:ss.fff") + " " + msg + "\r\n"); }
        catch { }
    }

    [STAThread]
    static int Main(string[] args)
    {
        logPath = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "..", "logs", "draghelper.log");
        if (args.Length < 1 || !File.Exists(args[0])) { Log("bad args"); return 1; }
        string file = args[0];

        Thread watchdog = new Thread(delegate () { Thread.Sleep(60000); Log("watchdog exit"); Environment.Exit(2); });
        watchdog.IsBackground = true;
        watchdog.Start();

        Application.EnableVisualStyles();

        Form chip = new Form();
        chip.FormBorderStyle = FormBorderStyle.None;
        chip.TopMost = true;
        chip.ShowInTaskbar = false;
        chip.StartPosition = FormStartPosition.Manual;
        chip.Size = new Size(240, 56);
        Point p = Cursor.Position;
        chip.Location = new Point(p.X - 120, p.Y - 28);
        chip.BackColor = Color.FromArgb(255, 170, 20);

        string name = Path.GetFileNameWithoutExtension(file);
        if (name.Length > 28) name = name.Substring(0, 26) + "..";
        Label lbl = new Label();
        lbl.Dock = DockStyle.Fill;
        lbl.TextAlign = ContentAlignment.MiddleCenter;
        lbl.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        lbl.ForeColor = Color.FromArgb(25, 25, 25);
        lbl.Text = name + "\r\nDRAG ME onto a track";
        lbl.Cursor = Cursors.SizeAll;
        chip.Controls.Add(lbl);

        bool dragged = false;
        MouseEventHandler onDown = delegate (object s, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Right) { chip.Close(); return; }
            if (e.Button != MouseButtons.Left) return;
            DataObject data = new DataObject();
            data.SetData(DataFormats.FileDrop, new string[] { file });
            DragDropEffects result = DragDropEffects.None;
            try { result = chip.DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link); }
            catch (Exception ex) { Log("FAILED " + ex.Message); }
            Log("chip drag done effect=" + result);
            dragged = result != DragDropEffects.None;
            if (dragged) chip.Close(); // drop landed; if cancelled, chip stays for retry
        };
        chip.MouseDown += onDown;
        lbl.MouseDown += onDown;

        chip.KeyPreview = true;
        chip.KeyDown += delegate (object s, KeyEventArgs e) { if (e.KeyCode == Keys.Escape) chip.Close(); };

        System.Windows.Forms.Timer idle = new System.Windows.Forms.Timer();
        idle.Interval = 30000;
        idle.Tick += delegate (object s, EventArgs e) { Log("chip idle timeout"); chip.Close(); };
        idle.Start();

        Log("chip shown for " + Path.GetFileName(file));
        Application.Run(chip);
        Log("chip closed dragged=" + dragged);
        return 0;
    }
}
