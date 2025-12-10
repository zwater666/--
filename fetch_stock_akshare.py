import akshare as ak
import sys
import json
import concurrent.futures

def get_stock_data(code):
    try:
        clean_code = code
        # 去除可能的前缀
        if code.startswith('sh') or code.startswith('sz'):
            clean_code = code[2:]
        # 或者是 6 位数字，akshare 通常只需要数字
            
        # 获取行情数据
        df_bid = ak.stock_bid_ask_em(symbol=clean_code)
        
        price = 0.0
        change_pct = 0.0
        
        price_row = df_bid[df_bid['item'] == '最新']
        change_pct_row = df_bid[df_bid['item'] == '涨幅']
        
        if not price_row.empty:
            val = price_row['value'].values[0]
            # 处理可能的非数字情况
            try:
                price = float(val)
            except:
                price = 0.0
            
        if not change_pct_row.empty:
            val = change_pct_row['value'].values[0]
            try:
                change_pct = float(val)
            except:
                change_pct = 0.0
            
        # 尝试获取名称（可选，如果失败不影响价格）
        name = code
        try:
            df_info = ak.stock_individual_info_em(symbol=clean_code)
            name_row = df_info[df_info['item'] == '股票简称']
            if not name_row.empty:
                name = name_row['value'].values[0]
        except:
            pass

        return {
            "code": code,
            "price": price,
            "change_pct": change_pct,
            "name": name
        }
    except Exception:
        return None

def fetch_data(codes):
    results = {}
    total = len(codes)
    count = 0
    # 使用线程池并发请求，提高速度
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_code = {executor.submit(get_stock_data, code): code for code in codes}
        for future in concurrent.futures.as_completed(future_to_code):
            code = future_to_code[future]
            try:
                data = future.result()
                if data:
                    results[code] = data
            except Exception:
                pass
            
            count += 1
            if count % 100 == 0 or count == total:
                sys.stderr.write(f"Progress: {count}/{total}\n")
                sys.stderr.flush()
    
    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    # 设置标准输出编码为 utf-8，防止中文乱码
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass # Python 3.6- might not support this
        
    if len(sys.argv) > 1:
        codes_arg = sys.argv[1]
        codes = codes_arg.split(',')
        fetch_data(codes)
    else:
        print(json.dumps({}))
