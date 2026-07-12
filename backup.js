// Roam Research graph exporter, derived from everruler12/roam2github (backup.js).
// Runs in GitHub Actions: signs in, opens each graph, runs "Export All" per format,
// and writes results into R2G_BACKUP_DIR. Logs step names only -- never graph
// content or credentials.
const path = require('path')
const zlib = require('zlib')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const extract = require('extract-zip')
const sanitize = require('sanitize-filename')

console.time('R2G Exit after')

if (fs.existsSync(path.join(__dirname, '.env'))) { // for local runs
    require('dotenv').config()
}

const {
    R2G_EMAIL, R2G_PASSWORD, R2G_GRAPH, R2G_BACKUP_DIR,
    R2G_BACKUP_JSON, R2G_BACKUP_EDN, R2G_BACKUP_MARKDOWN, R2G_BACKUP_MSGPACK,
    R2G_MD_REPLACEMENT, R2G_MD_SKIP_BLANKS, R2G_TIMEOUT
} = process.env

if (!R2G_EMAIL) error('Secrets error: R2G_EMAIL not found')
if (!R2G_PASSWORD) error('Secrets error: R2G_PASSWORD not found')
if (!R2G_GRAPH) error('Secrets error: R2G_GRAPH not found')

const graph_names = R2G_GRAPH.split(/,|\n/) // comma or linebreak separator
    .map(g => g.trim())
    .filter(g => g != '')

// type strings match the Roam export dialog labels exactly
const backup_types = [
    { type: 'JSON', enabled: R2G_BACKUP_JSON },
    { type: 'EDN', enabled: R2G_BACKUP_EDN },
    { type: 'Markdown', enabled: R2G_BACKUP_MARKDOWN },
    { type: 'msgpack', enabled: R2G_BACKUP_MSGPACK }
].map(f => ({ ...f, enabled: f.enabled === undefined || f.enabled.toLowerCase() === 'true' }))

const md_replacement = R2G_MD_REPLACEMENT || '�'
const md_skip_blanks = (R2G_MD_SKIP_BLANKS || '').toLowerCase() === 'false' ? false : true
const timeout = Number(R2G_TIMEOUT) || 600000 // 10 min default; Markdown export of a large graph needs more
const tmp_dir = path.join(__dirname, 'tmp')
const backup_dir = R2G_BACKUP_DIR || path.join(__dirname, 'backup')
const GITHUB_BLOB_LIMIT = 99 * 1024 * 1024 // GitHub rejects blobs >= 100 MB

init()

async function init() {
    try {
        await fs.remove(tmp_dir, { recursive: true })

        log('Backup dir:', backup_dir)
        log('Formats:', backup_types.filter(f => f.enabled).map(f => f.type).join(', '))

        log('Create browser')
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] }) // to run in GitHub Actions

        log('Login')
        await roam_login(browser)

        for (const graph_name of graph_names) {

            const page = await newPage(browser)
            const cdp = await page.createCDPSession()

            log('Open graph', graph_name)
            await roam_open_graph(page, graph_name)

            for (const f of backup_types) {
                if (!f.enabled) continue

                const download_dir = path.join(tmp_dir, graph_name, f.type.toLowerCase())
                await fs.ensureDir(download_dir)
                await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: download_dir, eventsEnabled: true })

                log('Export', f.type)
                await roam_export(page, f.type, download_dir)

                log('Extract', f.type)
                await extract_file(download_dir)

                await save(f.type, download_dir, graph_name)
            }

            await page.close()
        }

        log('Close browser')
        await browser.close()

        log('DONE!')

    } catch (err) { error(err) }

    console.timeEnd('R2G Exit after')
}

async function newPage(browser) {
    const page = await browser.newPage()
    page.setDefaultTimeout(timeout)
    return page
}

async function roam_login(browser) {
    const page = await newPage(browser)

    log('- Navigating to login page')
    await page.goto('https://roamresearch.com/#/signin')

    log('- Checking for email field')
    await page.waitForSelector('input[name="email"]')

    log('- Waiting for auto-refresh (astrolabe spinner)')
    try {
        await page.waitForSelector('.loading-astrolabe', { timeout: 20000 })
        await page.waitForSelector('.loading-astrolabe', { hidden: true })
    } catch { log('- (astrolabe not seen, continuing)') }

    log('- Filling email field')
    await page.type('input[name="email"]', R2G_EMAIL)

    log('- Filling password field')
    await page.type('input[name="password"]', R2G_PASSWORD)

    log('- Checking for "Sign In" button')
    await page.waitForFunction(() => [...document.querySelectorAll('button.bp3-button')].find(b => b.innerText == 'Sign In'))

    log('- Clicking "Sign In"')
    await page.evaluate(() => { [...document.querySelectorAll('button.bp3-button')].find(b => b.innerText == 'Sign In').click() })

    const login_error_selector = 'div[style="font-size: 12px; color: red;"]' // error message on login page
    const graphs_selector = '.my-graphs' // successful login, on graph selection page

    await page.waitForSelector(login_error_selector + ', ' + graphs_selector)

    if (await page.$(login_error_selector)) {
        const msg = await page.$eval(login_error_selector, el => el.innerText)
        throw new Error(`Login error. Roam says: "${msg}"`)
    }

    log('Login successful!')
}

async function roam_open_graph(page, graph_name) {
    page.on('dialog', async dialog => await dialog.accept()) // "Changes will not be saved" dialog

    log('- Navigating to graph')
    await page.goto(`https://roamresearch.com/#/app/${graph_name}?disablecss=true&disablejs=true`)

    try {
        await page.waitForSelector('.loading-astrolabe', { timeout: 20000 })
        log('- astrolabe spinning...')
    } catch { log('- (astrolabe not seen, continuing)') }

    log('- Waiting for .roam-app selector')
    await page.waitForSelector('.roam-app', { timeout })

    log('Graph loaded!')
}

async function roam_export(page, filetype, download_dir) {
    log('- Checking for "..." button')
    await page.waitForSelector('.bp3-icon-more', { timeout })

    await sleep(1000) // let any startup modal appear

    for (const modal of ['.rm-quick-capture-sync-modal', '.rm-modal-dialog--expired-plan']) {
        if (await page.$(modal)) {
            log('- Dismissing modal', modal)
            await page.keyboard.press('Escape')
            await page.waitForSelector(modal, { hidden: true })
        }
    }

    log('- Clicking "..." button')
    await page.click('.bp3-icon-more')

    log('- Checking for "Export All" option')
    await page.waitForFunction(() => [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.includes('Export All')))

    log('- Clicking "Export All" option')
    await page.evaluate(() => { [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.includes('Export All')).click() })

    const chosen_format_selector = '.bp3-dialog .bp3-button-text'

    log('- Checking for export dialog')
    await page.waitForSelector(chosen_format_selector)

    const chosen_format = (await page.$eval(chosen_format_selector, el => el.innerText)).trim()
    log(`- Format chosen is "${chosen_format}"`)

    if (filetype !== chosen_format) {
        log('- Opening format dropdown')
        await page.click(chosen_format_selector)

        // exact match: substring would confuse "Markdown" with "Flat Markdown"
        log('- Waiting for dropdown option', filetype)
        await page.waitForFunction(ft => [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].some(el => el.innerText.trim() === ft), {}, filetype)

        log('- Clicking', filetype)
        await page.evaluate(ft => { [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(el => el.innerText.trim() === ft).click() }, filetype)
    } else {
        log('-', filetype, 'already selected')
    }

    log('- Checking for "Export All" button')
    await page.waitForFunction(() => [...document.querySelectorAll('button.bp3-button.bp3-intent-primary')].find(b => b.innerText.includes('Export All')))

    log('- Clicking "Export All" button')
    await page.evaluate(() => { [...document.querySelectorAll('button.bp3-button.bp3-intent-primary')].find(b => b.innerText.includes('Export All')).click() })

    log('- Waiting for export to generate (spinner; Markdown can take 20+ minutes)')
    await page.waitForSelector('.bp3-spinner')
    await page.waitForSelector('.bp3-spinner', { hidden: true })

    log('- Downloading')
    await waitForDownload(download_dir)
}

async function waitForDownload(download_dir) {
    const deadline = Date.now() + timeout
    let polls = 0

    while (Date.now() < deadline) {
        const files = await fs.readdir(download_dir)

        if (files.length > 0 && !files.some(f => f.endsWith('.crdownload'))) {
            log('-', files[0], 'downloaded!')
            return
        }

        if (++polls % 15 === 0 && files[0]) {
            const size = (await fs.stat(path.join(download_dir, files[0])).catch(() => ({ size: 0 }))).size
            log(`- still downloading (${Math.round(size / 1e6)} MB)`)
        }

        await sleep(2000)
    }

    throw new Error(`Download timeout after ${timeout}ms`)
}

async function extract_file(download_dir) {
    const files = await fs.readdir(download_dir)

    if (files.length === 0) throw new Error('Extraction error: download_dir is empty')
    if (files.length > 1) throw new Error('Extraction error: download_dir contains more than one file')

    const file = files[0]
    const file_fullpath = path.join(download_dir, file)
    const extract_dir = path.join(download_dir, '_extraction')

    if (!file.endsWith('.zip')) { // msgpack may arrive unzipped
        log('- Not a zip, keeping raw:', file)
        await fs.move(file_fullpath, path.join(extract_dir, file))
        return
    }

    log('- Extracting', file)
    await extract(file_fullpath, { dir: extract_dir })

    // replicates the roam2github extract-zip fork: drop blank pages, flatten any
    // nested entries (full-width slash), sanitize names, remove leftover dirs
    const entries = await fs.readdir(extract_dir, { recursive: true, withFileTypes: true })

    for (const e of entries) {
        if (!e.isFile()) continue

        const rel = path.relative(extract_dir, path.join(e.parentPath, e.name))
        const abs = path.join(extract_dir, rel)

        if (md_skip_blanks && (await fs.stat(abs)).size <= 3) { // 3-byte files are single blank blocks (like blank daily notes)
            await fs.remove(abs)
            continue
        }

        const flat = sanitizeFileName(rel.split(path.sep).join('/'))
        if (flat !== rel) await fs.move(abs, path.join(extract_dir, flat), { overwrite: true })
    }

    for (const e of await fs.readdir(extract_dir, { withFileTypes: true })) {
        if (e.isDirectory()) await fs.remove(path.join(extract_dir, e.name)) // now-empty after flattening
    }
}

async function save(filetype, download_dir, graph_name) {
    const extract_dir = path.join(download_dir, '_extraction')
    const files = await fs.readdir(extract_dir)

    if (files.length === 0) throw new Error('Save error: extraction dir is empty')

    if (filetype === 'Markdown') {
        const markdown_dir = path.join(backup_dir, 'markdown', graph_name)

        log('- Replacing markdown directory') // full replace so renamed/deleted pages track
        await fs.remove(markdown_dir, { recursive: true })

        log('- Saving', files.length, 'markdown files')
        for (const file of files) {
            await fs.move(path.join(extract_dir, file), path.join(markdown_dir, file), { overwrite: true })
        }

    } else {
        // raw, stable-named file (no pretty-printing: formatted 80-95 MB exports would
        // exceed GitHub's blob limit, and stable names let git delta-compress daily runs)
        const file = files[0]
        const fileext = file.split('.').pop()
        const dest = path.join(backup_dir, filetype.toLowerCase(), `${graph_name}.${fileext}`)

        await fs.remove(dest + '.gz') // drop stale gzip fallback from a previous run
        log('- Saving', path.relative(backup_dir, dest))
        await fs.move(path.join(extract_dir, file), dest, { overwrite: true })

        const size = (await fs.stat(dest)).size
        log(`- ${filetype} size: ${Math.round(size / 1e6)} MB`)

        if (size > GITHUB_BLOB_LIMIT) {
            log(`- WARNING: ${filetype} exceeds GitHub's 100 MB blob limit, gzipping in place`)
            fs.writeFileSync(dest + '.gz', zlib.gzipSync(fs.readFileSync(dest)))
            await fs.remove(dest)
        }
    }
}

function log(...messages) {
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '')
    console.log(timestamp, 'R2G', ...messages)
}

function error(err) {
    log('ERROR -', err)
    console.timeEnd('R2G Exit after')
    process.exit(1)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function sanitizeFileName(fileName) {
    fileName = fileName.replace(/\//g, '／') // full-width slash, Roam namespace convention
    return sanitize(fileName, { replacement: md_replacement })
}
