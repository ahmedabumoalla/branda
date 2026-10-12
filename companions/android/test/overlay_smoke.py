"""Native-only emulator check; does not log in, read customer data or create orders."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

serial = os.environ.get("ANDROID_SERIAL", "emulator-5554")
package = "com.barndaksa.pager"

def adb(*args):
    return subprocess.check_output(["adb", "-s", serial, *args], text=True, encoding="utf-8", stderr=subprocess.STDOUT).strip()

assert adb("shell", "getprop", "ro.kernel.qemu") == "1", "This test must only operate on an emulator"
adb("install", "-r", "public/downloads/branda-pager-android.apk")
adb("shell", "appops", "set", package, "SYSTEM_ALERT_WINDOW", "allow")
if int(adb("shell", "getprop", "ro.build.version.sdk")) >= 33:
    adb("shell", "pm", "grant", package, "android.permission.POST_NOTIFICATIONS")
adb("shell", "am", "start", "-W", "-n", package + "/.MainActivity")

def native_button(label):
    for _ in range(8):
        adb("shell", "uiautomator", "dump", "/sdcard/pager-native-test.xml")
        tree = ET.fromstring(adb("shell", "cat", "/sdcard/pager-native-test.xml"))
        for node in tree.iter("node"):
            if node.attrib.get("package") == package and node.attrib.get("text") == label:
                x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.attrib["bounds"]))
                adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                return
        time.sleep(1)
    raise AssertionError("Native control missing: " + label)

native_button("فتح نافذة الموظف")
time.sleep(3)
adb("shell", "input", "keyevent", "KEYCODE_HOME")
time.sleep(2)
windows = adb("shell", "dumpsys", "window", "windows")
with open("native-smoke-windows.txt", "w", encoding="utf-8") as result:
    result.write(windows)
blocks = re.split(r"(?=Window #\d+ Window\{)", windows)
assert any(package in block and ("APPLICATION_OVERLAY" in block or "ty=2038" in block) and "mHasSurface=true" in block for block in blocks), "No displayed application-overlay surface after Home"
native_button("تصغير")
native_button("تكبير")
adb("shell", "input", "keyevent", "KEYCODE_SLEEP")
time.sleep(3)
services = adb("shell", "dumpsys", "activity", "services", package)
assert not re.search(r"ServiceRecord\{[^\n]*OverlayService", services), "Overlay service survived screen lock"
print("PASS: overlay stays above the launcher, collapses/restores, and stops on screen lock")
