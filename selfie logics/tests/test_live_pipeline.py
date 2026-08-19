#!/usr/bin/env python3
"""
==============================================================================
SELFIE LOGIC END-TO-END LIVE PIPELINE TEST
==============================================================================
Fill in your test inputs in the CONFIGURATION section below, then run this file.

Workflow:
1. Client Side: Processes inputs, generates uploadID, creates compressed image payload.
2. Apps Script Backend: Posts to Google Apps Script -> Writes image to Google Drive & adds row to Google Sheet.
3. Kiosk Display: Polls doGet endpoint, receives delta row, advances kiosk cursor, and prints final display state.
==============================================================================
"""

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request

# ==============================================================================
# 📝 CONFIGURATION - EDIT YOUR TEST INPUTS HERE
# ==============================================================================

# Your deployed Google Apps Script Web App /exec URL
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxSF4jpu4_OlV789RlKx-nWhO6I3shv5AtIDWuTypCj6Rr90cylLvgqAT4mQHRdn1BB4Q/exec"

# Guest metadata inputs
GUEST_NAME  = "Sayuri Janbandhu"
GUEST_PHONE = "+919763275269"

# Path to an image on your computer (PNG/JPG), or leave empty to use auto-generated sample selfie
LOCAL_IMAGE_PATH = ""

# Output image settings
JPEG_QUALITY = 0.88
MAX_DIMENSION = 1600

# ==============================================================================
# 🛠️ HELPER FUNCTIONS & PIPELINE LOGIC
# ==============================================================================

def get_base64_image(image_path):
    """Loads image from disk or generates a valid sample JPEG base64 string."""
    if image_path and os.path.isfile(image_path):
        with open(image_path, "rb") as img_file:
            encoded = base64.b64encode(img_file.read()).decode("utf-8")
            ext = os.path.splitext(image_path)[1].lower()
            mime = "image/png" if ext == ".png" else "image/jpeg"
            return f"data:{mime};base64,{encoded}"
    
    # Default tiny valid 1x1 JPEG image base64 fallback
    sample_b64 = (
        "data:image/jpeg;base64,"
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP////////////////////////////////////////////////"
        "//////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAA"
        "AP/aAAgBAQABPxA="
    )
    return sample_b64

def generate_upload_id():
    """Simulates client_uplode.js uploadID generation."""
    return f"upload_{int(time.time())}"

def run_pipeline():
    print("=" * 65)
    print("           🚀 SELFIE LOGIC FULL PIPELINE EXECUTION            ")
    print("=" * 65)
    
    if not APPS_SCRIPT_URL:
        print("\n❌ Error: APPS_SCRIPT_URL is empty! Please set APPS_SCRIPT_URL at the top of this file.")
        sys.exit(1)
        
    upload_id = f"test_kiosk_{int(time.time())}"
    image_data = get_base64_image(LOCAL_IMAGE_PATH)
    
    print("\n--- 1️⃣ CLIENT SIDE STEP ---")
    print(f"• Generated Upload ID : {upload_id}")
    print(f"• Guest Name          : {GUEST_NAME or '(blank)'}")
    print(f"• Guest Phone         : {GUEST_PHONE or '(blank)'}")
    print(f"• Image Payload Size  : {len(image_data)} bytes")
    
    # --------------------------------------------------------------------------
    # STEP 2: APPS SCRIPT POST (WRITE TO DRIVE AND SHEET)
    # --------------------------------------------------------------------------
    print("\n--- 2️⃣ APPS SCRIPT BACKEND STEP (Writing to Drive & Sheet) ---")
    post_payload = {
        "uploadID": upload_id,
        "name": GUEST_NAME,
        "phone": GUEST_PHONE,
        "imageData": image_data,
        "contentType": "image/jpeg",
        "fileName": f"{upload_id}.jpg"
    }
    
    try:
        req = urllib.request.Request(
            APPS_SCRIPT_URL,
            data=json.dumps(post_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as resp:
            post_resp = json.loads(resp.read().decode('utf-8'))
            
        print("Response received from Google Apps Script:")
        print(json.dumps(post_resp, indent=2))
        
        if not post_resp.get('ok'):
            print(f"\n❌ Apps Script execution failed: {post_resp.get('error')}")
            sys.exit(1)
            
        row_number = post_resp.get('rowNumber')
        drive_url = post_resp.get('imageURL')
        
        print(f"\n✅ DRIVE SUCCESS : Photo saved to Drive ➔ {drive_url}")
        print(f"✅ SHEET SUCCESS : Added to Sheet ➔ Row Number #{row_number}")
        
    except Exception as err:
        print(f"\n❌ HTTP POST Error: {err}")
        sys.exit(1)
        
    # --------------------------------------------------------------------------
    # STEP 3: KIOSK DISPLAY STEP (POLLING & REVEAL)
    # --------------------------------------------------------------------------
    print("\n--- 3️⃣ KIOSK DISPLAY STEP (Polling & Revealing Output) ---")
    since_cursor = row_number - 1
    get_url = f"{APPS_SCRIPT_URL}?since={since_cursor}"
    
    print(f"Kiosk polling endpoint: {get_url}")
    
    try:
        req_get = urllib.request.Request(get_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_get) as resp:
            kiosk_payload = json.loads(resp.read().decode('utf-8'))
            
        print("\nRaw Kiosk Delta Response received:")
        print(json.dumps(kiosk_payload, indent=2))
        
        rows = kiosk_payload.get('rows', [])
        target_row = next((r for r in rows if r.get('rowNumber') == row_number), None)
        
        if target_row:
            print("\n" + "=" * 65)
            print("                📺 FINAL KIOSK DISPLAY OUTPUT                 ")
            print("=" * 65)
            print(f"  Row Number    : #{target_row.get('rowNumber')}")
            print(f"  Upload ID     : {target_row.get('uploadID')}")
            print(f"  Guest Name    : {target_row.get('name')}")
            print(f"  Guest Phone   : {target_row.get('phone')}")
            print(f"  Image URL     : {target_row.get('imageURL')}")
            print(f"  Timestamp     : {target_row.get('timestamp')}")
            print(f"  Kiosk Cursor  : Advanced to position #{kiosk_payload.get('cursor')}")
            print("=" * 65)
            print("\n✨ PIPELINE TEST COMPLETED SUCCESSFULLY! ✨")
        else:
            print(f"\n⚠️ Row #{row_number} was created, but not returned in delta fetch. Check cache settings.")
            
    except Exception as err:
        print(f"\n❌ Kiosk Poll Error: {err}")
        sys.exit(1)

if __name__ == "__main__":
    run_pipeline()
