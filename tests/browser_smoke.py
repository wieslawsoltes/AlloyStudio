"""Real browser workflow tests. Optional development dependency: pip install playwright.
Run normal hosted test: python tests/browser_smoke.py --url http://localhost:8080
Offline content injection (no origin/persistence tests): --inline --headed --software
CHROMIUM_PATH selects an installed browser; otherwise Playwright's Chromium is used.
"""
import argparse, asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def run(args):
 checks=[];errors=[]
 async with async_playwright() as pw:
  options={'headless':not args.headed,'args':['--no-sandbox','--disable-gpu-sandbox']}
  if args.software: options['args']+=['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  if os.getenv('CHROMIUM_PATH'): options['executable_path']=os.environ['CHROMIUM_PATH']
  browser=await pw.chromium.launch(**options)
  page=await browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
  page.on('pageerror',lambda e: errors.append(str(e)))
  async def settled():
   await page.wait_for_function("window.Alloy?.ready && !document.querySelector('#app').classList.contains('busy')",timeout=30000)
   await page.wait_for_timeout(150)
  async def check(name,expression):
   value=await page.evaluate(expression)
   assert value, f'{name}: {value}'
   checks.append(name);print('PASS',name)
  if args.inline: await page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load')
  else: await page.goto(args.url)
  await settled()
  await check('Demo: 12 bodies and no feature errors',"Alloy.model.bodies.length===12 && Alloy.model.errors.length===0")
  initial_backend=await page.evaluate('Alloy.renderer.backend')
  if args.require_webgpu: assert initial_backend=='WebGPU', 'WebGPU was required but the app selected '+initial_backend
  await page.screenshot(path=str(ROOT/'tests/screenshots/workspace.png'))
  await page.locator('#ribbon [data-command=box]').click()
  for name,value in [('width','40'),('depth','30'),('height','12'),('radius','0'),('x','120')]: await page.locator(f'#feature-form [name={name}]').fill(value)
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Box creation computes 14400 mm3',"Math.abs(Alloy.model.bodies.at(-1).mesh.stats.volume-14400)<.01")
  await page.locator('#timeline [data-feature]').last.click()
  await page.locator('#feature-form [name=height]').fill('20')
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Timeline editing regenerates 24000 mm3',"Math.abs(Alloy.model.bodies.at(-1).mesh.stats.volume-24000)<.01")
  await page.evaluate("Alloy.command('undo')");await settled()
  await check('Undo restores previous geometry',"Math.abs(Alloy.model.bodies.at(-1).mesh.stats.volume-14400)<.01")
  await page.evaluate("Alloy.command('redo')");await settled()
  await check('Redo restores edited geometry',"Math.abs(Alloy.model.bodies.at(-1).mesh.stats.volume-24000)<.01")
  await page.evaluate("Alloy.select(Alloy.model.bodies.at(-1).id);Alloy.command('move')")
  await page.locator('#feature-form [name=x]').fill('10')
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Move changes world-space bounds',"Math.abs(Alloy.model.bodies.at(-1).mesh.stats.bounds.min[0]-110)<.01")
  await page.evaluate("Alloy.command('pattern')")
  await page.locator('#feature-form [name=count]').fill('3')
  await page.locator('#feature-form [name=spacing]').fill('60')
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Linear pattern creates additional bodies',"Alloy.model.bodies.length===15 && Alloy.model.errors.length===0")
  await page.evaluate("Alloy.select(Alloy.model.bodies.at(-1).id)")
  await page.locator('[data-material=blue]').click();await settled()
  await check('Appearance assignment persists in document',"Alloy.model.bodies.at(-1).material==='blue'")
  await page.locator('#rename-body').fill('Test pattern body');await page.locator('#rename-body').press('Tab');await settled()
  await check('Body rename survives regeneration',"Alloy.model.bodies.at(-1).name==='Test pattern body'")
  await page.evaluate("Alloy.command('parameters')")
  row=page.locator('#parameter-rows tr').filter(has=page.locator('input[value=baseWidth]'))
  await row.locator('.param-expression').fill('180')
  await page.locator('[data-action=save-parameters]').click();await settled()
  await check('Named parameters drive downstream geometry',"Alloy.model.parameters.baseWidth===180 && Alloy.model.errors.length===0")
  await page.evaluate("Alloy.command('history-start')");await settled()
  await check('Timeline rollback removes later features',"Alloy.model.bodies.length===1")
  await page.evaluate("Alloy.command('history-end')");await settled()
  await check('Timeline replay restores all bodies',"Alloy.model.bodies.length===15")
  await page.evaluate("Alloy.command('section')")
  await page.locator('[name=section-axis]').select_option('Z')
  await page.locator('[name=section-offset]').fill('40');await page.locator('[name=section-offset]').press('Tab')
  await check('Section control updates renderer plane',"Alloy.renderer.section.enabled && Alloy.renderer.section.axis==='Z' && Alloy.renderer.section.offset===40")
  await page.locator('[data-action=close-inspector]').first.click()
  await page.evaluate("Alloy.renderer.section.enabled=false;Alloy.renderer.shadowDirty=true;Alloy.renderer.invalidate()")
  blank={'format':'alloy-studio','version':1,'name':'Sketch workflow test','units':'mm','features':[],'parameters':{},'appearances':{},'hidden':[],'rollback':None}
  await page.evaluate('(d)=>Alloy.loadDocument(d)',blank);await settled()
  await page.locator('#ribbon [data-command=create-sketch]').click()
  box=await page.locator('#overlay').bounding_box()
  x,y,w,h=box['x'],box['y'],box['width'],box['height']
  await page.mouse.move(x+w*.35,y+h*.38);await page.mouse.down();await page.mouse.move(x+w*.61,y+h*.62,steps=12);await page.mouse.up()
  await check('Drag creates a real closed sketch profile',"Alloy.state.sketch.profiles.length===1")
  await page.locator('[name=profile-width]').fill('40');await page.locator('[name=profile-width]').press('Tab')
  await page.locator('[name=profile-height]').fill('30');await page.locator('[name=profile-height]').press('Tab')
  await page.locator('#sketch-footer [data-command=finish-sketch]').click();await settled()
  await check('Finish sketch adds an editable profile feature',"Alloy.model.sketches.length===1 && Alloy.document.features.length===1")
  await page.locator('#ribbon [data-command=extrude]').click()
  await page.locator('#feature-form [name=distance]').fill('10')
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Sketch extrusion produces expected volume',"Alloy.model.bodies.length===1 && Math.abs(Alloy.model.bodies[0].mesh.stats.volume-12000)<.01")
  await page.evaluate("Alloy.command('box')")
  await page.locator('[data-action=preview-feature]').click();await settled()
  await check('Feature preview changes geometry without committing document',"Alloy.model.bodies.length===2 && Alloy.document.features.length===2 && Alloy.state.preview")
  await page.locator('[data-action=close-inspector]').first.click();await settled()
  await check('Canceling preview restores committed geometry',"Alloy.model.bodies.length===1 && Alloy.document.features.length===2 && !Alloy.state.preview")
  await page.evaluate("Alloy.command('fit');Alloy.command('hole')")
  await page.locator('#feature-form [name=radius]').fill('3')
  await page.locator('#feature-form [name=depth]').fill('12')
  await page.locator('#feature-form [name=z]').fill('-1')
  # Place the hole at the actual sketch's world-space center.
  center=await page.evaluate('Alloy.model.sketches[0].origin')
  await page.locator('#feature-form [name=x]').fill(str(center[0]));await page.locator('#feature-form [name=y]').fill(str(center[1]))
  await page.locator('[data-action=apply-feature]').click();await settled()
  await check('Hole removes material from the extruded sketch',"Alloy.model.errors.length===0 && Alloy.model.bodies[0].mesh.stats.volume<11800 && Alloy.model.bodies[0].mesh.stats.volume>11600")
  await page.evaluate("Alloy.select(Alloy.model.bodies[0].id)")
  await page.screenshot(path=str(ROOT/'tests/screenshots/editing.png'))
  for cmd,ext in [('save','.alloy'),('export-stl','.stl'),('export-obj','.obj'),('drawing','.svg'),('screenshot','.png')]:
   async with page.expect_download(timeout=10000) as event: await page.evaluate('(c)=>Alloy.command(c)',cmd)
   download=await event.value
   await download.save_as(str(ROOT/'tests/screenshots'/('export'+ext)))
   assert (ROOT/'tests/screenshots'/('export'+ext)).stat().st_size>100
   checks.append('Export '+ext);print('PASS Export',ext)
  await page.locator('#file-input').set_input_files(str(ROOT/'tests/screenshots/export.alloy'))
  await page.wait_for_timeout(400);await settled()
  await check('Saved Alloy project reopens with editable history',"Alloy.document.features.length===3 && Alloy.model.bodies.length===1 && Alloy.model.errors.length===0")
  for ext,count in [('stl',2),('obj',3)]:
   await page.locator('#file-input').set_input_files(str(ROOT/'tests/screenshots'/('export.'+ext)))
   await page.wait_for_function('(n)=>Alloy.model.bodies.length===n',arg=count,timeout=30000);await settled()
   await check('Mesh import '+ext.upper()+': geometry round trip',"Alloy.model.errors.length===0 && Math.abs(Alloy.model.bodies.at(-1).mesh.stats.volume-Alloy.model.bodies[0].mesh.stats.volume)<.1")
  await page.evaluate("Alloy.loadDocument(Alloy.createDemo())");await settled()
  await page.keyboard.press('Control+k');await page.locator('#palette-input').fill('cylinder');await page.keyboard.press('Enter')
  await check('Command palette opens a working feature editor',"Alloy.state.form?.type==='cylinder'")
  await page.locator('[data-action=close-inspector]').first.click()
  await page.mouse.move(1450,70)
  await page.wait_for_timeout(4200)
  await page.screenshot(path=str(ROOT/'tests/screenshots/workspace.png'))
  if args.inline: await check('Unavailable local storage never reports a successful autosave',"document.querySelector('#save-state').textContent.includes('Use File')")
  await check('Renderer reported no uncaptured GPU errors',"!Alloy.renderer.lastGPUError")
  assert not errors, errors
  report={'backend':initial_backend,'originMode':'inline opaque origin' if args.inline else args.url,'softwareRendererRequested':args.software,'checks':checks,'passed':len(checks),'pageErrors':errors,'note':'GPU execution speed is not benchmarked. Inline mode does not exercise IndexedDB or secure-context WebGPU.'}
  (ROOT/'tests/browser-results.json').write_text(json.dumps(report,indent=2))
  print(json.dumps(report,indent=2))
  await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://localhost:8080');parser.add_argument('--inline',action='store_true');parser.add_argument('--headed',action='store_true');parser.add_argument('--software',action='store_true');parser.add_argument('--require-webgpu',action='store_true');asyncio.run(run(parser.parse_args()))
