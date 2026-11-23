"""Exercise the compact research workspace on desktop and mobile."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.getenv('BASE_URL', 'http://127.0.0.1:8000')

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1440,'height':1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until='networkidle')
        page.wait_for_function('document.querySelector("#profile-select")?.value?.startsWith("KH-")')
        assert page.locator('[data-group=h1]').get_attribute('aria-pressed') == 'true'
        assert page.locator('.advanced-controls').get_attribute('open') is None
        for group, count in [('h1',4),('h2',3),('h3',4),('all',7)]:
            page.locator(f'[data-group={group}]').click()
            page.locator('#run-button').click()
            page.wait_for_function(f'document.querySelectorAll(".model-card").length === {count}')
            assert page.locator('.compact-target').is_visible()
            assert page.locator('.model-card > .ranking-list').first.locator('li').count() == 5
            page.locator('.ranking-more summary').first.click()
            assert page.locator('.ranking-more').first.locator('li').count() == 5
        with page.expect_download() as download:
            page.locator('[data-action=case-csv]').click()
        assert download.value.suggested_filename.endswith('.csv')
        page.locator('#profile-search').fill('KH-0020')
        page.wait_for_function('document.querySelector("#profile-select").value === "KH-0020"')
        assert page.locator('.model-card').count() == 0
        page.locator('#run-button').click()
        page.locator('.model-card').first.wait_for()
        page.screenshot(path=str(ROOT/'docs/screenshots/research-web-case.png'))
        for route, selector in [('results','#metrics-body table'),('discussion','#discussion-evidence .stats'),('method','.model-definition')]:
            page.locator(f'a[data-nav={route}]').click()
            page.locator(selector).first.wait_for()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
        mobile.on('pageerror', lambda e: errors.append(str(e)))
        mobile.goto(BASE, wait_until='networkidle')
        mobile.wait_for_function('document.querySelector("#profile-select")?.value?.startsWith("KH-")')
        mobile.locator('[data-group=h3]').click()
        mobile.locator('#run-button').click()
        mobile.locator('.model-card').first.wait_for()
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
        mobile.screenshot(path=str(ROOT/'docs/screenshots/research-web-mobile.png'))
        assert not errors, errors
        browser.close()
        print('PASS: H1/H2/H3/all, direct comparison, expanded rankings, CSV, stale result invalidation, research pages and mobile; no JavaScript errors.')

if __name__ == '__main__':
    main()
