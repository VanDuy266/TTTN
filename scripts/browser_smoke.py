"""Optional browser acceptance check; requires Playwright and local Chromium."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
def main(base):
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1536,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base,wait_until='networkidle')
        page.get_by_role('heading',name='Ba hướng thực nghiệm').wait_for()
        assert 'DAD' in page.title()
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-overview.png'))
        page.locator('a[data-nav=experiment]').click()
        page.wait_for_function('document.querySelector("#profile-select")?.value?.startsWith("KH-")')
        page.get_by_role('button',name='So sánh dự đoán',exact=False).click()
        page.locator('.model-card').first.wait_for();assert page.locator('.model-card').count()==7
        assert page.locator('.target-name').count()==0
        page.get_by_role('button',name='Hiện sản phẩm thực tế',exact=False).click();page.locator('.target-name').wait_for()
        with page.expect_download() as download:
            page.get_by_role('button',name='Xuất đối chiếu CSV',exact=False).click()
        assert download.value.suggested_filename.endswith('.csv')
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-case.png'))
        # Search changing the selected profile must invalidate the previously displayed result.
        page.fill('#profile-search','KH-0020')
        page.wait_for_function('document.querySelector("#profile-select")?.value==="KH-0020"')
        assert page.locator('.model-card').count()==0
        page.get_by_role('button',name='So sánh dự đoán',exact=False).click();page.locator('.model-card').first.wait_for()
        page.get_by_role('button',name='Không có lịch sử trước thời điểm kiểm tra',exact=True).click()
        page.wait_for_function('document.querySelector("#profile-select").selectedOptions[0].textContent.includes("0 lịch sử")')
        page.get_by_role('button',name='So sánh dự đoán',exact=False).click()
        page.get_by_text('Không có tương tác trước thời điểm kiểm tra.',exact=False).wait_for()
        page.locator('a[data-nav=results]').click();page.locator('#metrics-body table').first.wait_for()
        page.select_option('#metrics-cohort','cold')
        page.wait_for_function('document.querySelector("#metric-context").textContent.includes("550")')
        page.select_option('#metrics-protocol','sampled100')
        page.wait_for_function('document.querySelector("#metric-context").textContent.includes("99 sản phẩm đối chứng")')
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-results.png'))
        page.locator('a[data-nav=discussion]').click();page.locator('#discussion-evidence .stats').wait_for()
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-discussion.png'))
        page.locator('a[data-nav=method]').click();page.locator('.training-panel').first.wait_for()
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-method.png'))
        mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        mobile.goto(base,wait_until='networkidle');mobile.get_by_role('heading',name='Ba hướng thực nghiệm').wait_for()
        mobile.screenshot(path=str(ROOT/'docs/screenshots/research-web-mobile.png'))
        mobile.locator('#menu-button').click();mobile.locator('a[data-nav=experiment]').click()
        mobile.wait_for_function('document.querySelector("#profile-select")?.value?.startsWith("KH-")')
        mobile.get_by_role('button',name='So sánh dự đoán',exact=False).click();mobile.locator('.model-card').first.wait_for()
        assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print('PASS: DAD branding, seven-model comparison including H3, reveal, CSV, profile invalidation, fallback, cohort/protocol changes, discussion, training curves, mobile; no JS errors.')
        browser.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:8501');args=parser.parse_args();main(args.base)
