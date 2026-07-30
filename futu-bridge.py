"""
FutuOpenD → HTTP Bridge
Run: python futu-bridge.py
Then access: http://localhost:3456/api/data
"""
from flask import Flask, jsonify
from flask_cors import CORS
from futu import *
import threading, time, json

app = Flask(__name__)
CORS(app)

# ── Symbol mapping ──
SYMBOLS = {
    'GOLD':   'US.GCmain',    # COMEX Gold futures
    'SILVER': 'US.SImain',    # COMEX Silver
    'PLAT':   'US.PLmain',    # NYMEX Platinum
    'PALL':   'US.PAmain',    # NYMEX Palladium
    'WTI':    'US.CLmain',    # NYMEX WTI Crude
    'BRENT':  'US.BOmain',    # Brent Crude (ICE)
    'COPPER': 'US.HGmain',    # COMEX Copper
    'DXY':    'US.DXmain',    # ICE Dollar Index
    'SPX':    'US.ESmain',    # S&P 500 E-mini futures
    'NAS':    'US.NQmain',    # Nasdaq E-mini futures
    'VIX':    'US.VXmain',    # VIX futures
    'HSI':    'HK.HSImain',   # Hang Seng futures
}

# ── Global price store ──
prices = {}
quote_ctx = None

def connect_futu():
    global quote_ctx
    quote_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)
    print('[Futu] Connected to OpenD')

    # Subscribe to all symbols
    futu_symbols = list(SYMBOLS.values())
    ret, data = quote_ctx.subscribe(futu_symbols, [SubType.QUOTE], subscribe_push=False)
    if ret == RET_OK:
        print(f'[Futu] Subscribed to {len(futu_symbols)} symbols')
    else:
        print(f'[Futu] Subscribe error: {data}')

def fetch_all():
    """Fetch current prices for all subscribed symbols"""
    futu_symbols = list(SYMBOLS.values())
    ret, data = quote_ctx.get_market_snapshot(futu_symbols)
    if ret == RET_OK:
        for _, row in data.iterrows():
            # Map Futu symbol back to our key
            for key, fs in SYMBOLS.items():
                if fs == row['code']:
                    prices[key] = {
                        'price': round(float(row.get('last_price', 0)), 2),
                        'high':  round(float(row.get('high_price', 0)), 2),
                        'low':   round(float(row.get('low_price', 0)), 2),
                        'open':  round(float(row.get('open_price', 0)), 2),
                        'prevClose': round(float(row.get('prev_close_price', 0)), 2),
                        'change': round(float(row.get('change_val', 0)), 2),
                        'changePct': round(float(row.get('change_rate', 0)), 2),
                        'volume': int(row.get('volume', 0)),
                        'updateTime': str(row.get('update_time', '')),
                    }
    else:
        print(f'[Futu] Snapshot error: {data}')

def poll_loop():
    """Poll every 5 seconds"""
    while True:
        try:
            fetch_all()
            print(f'[Poll] {len(prices)} symbols updated')
        except Exception as e:
            print(f'[Poll] Error: {e}')
        time.sleep(5)

@app.route('/api/data')
def api_data():
    return jsonify({'prices': prices, 'timestamp': time.time(), 'source': 'futu'})

@app.route('/api/health')
def api_health():
    return jsonify({'ok': True, 'symbols': len(prices)})

if __name__ == '__main__':
    connect_futu()
    fetch_all()
    threading.Thread(target=poll_loop, daemon=True).start()
    print('[Bridge] HTTP server on http://localhost:3456')
    app.run(host='0.0.0.0', port=3456, debug=False)
