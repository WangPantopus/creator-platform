"""Builds one self-contained HTML page per preview and theme, for check.js, shots.js and measure.js.

Usage: REACT_JS=/path/react.production.min.js REACT_DOM_JS=/path/react-dom.production.min.js python3 build.py
Pages go to ../rendercheck (or $OUT). React 18 UMD builds are not kept in the repo.
"""
import json,os,re
HERE=os.path.dirname(os.path.abspath(__file__))
base=os.path.join(HERE,'..','project')
OUT=os.environ.get('OUT', os.path.join(HERE,'..','rendercheck'))
os.makedirs(os.path.join(OUT,'shots'), exist_ok=True)
react=open(os.environ['REACT_JS']).read(); rdom=open(os.environ['REACT_DOM_JS']).read()
tok=json.load(open(base+'/tokens.json'))
themes=[t['id'] for t in tok['color']['themes']]
def cval(v,th):
    v2=v if isinstance(v,str) else v.get(th, v[themes[0]])
    m=re.fullmatch(r'\{(.+)\}',v2)
    return 'var(--%s)'%m.group(1) if m else v2
css=[]
for th in themes:
    sel=':root, [data-theme="%s"]'%th if th==themes[0] else '[data-theme="%s"]'%th
    lines=['--%s: %s;'%(t['name'],cval(t['value'],th)) for t in tok['color']['tokens']+tok['shadow']['tokens']]
    css.append(sel+' {'+' '.join(lines)+'}')
root=['--%s: %s;'%(t['name'],t['value']) for fam in ('spacing','radius','zIndex') for t in tok[fam]['tokens']]
root+=['--font-%s: %s;'%(k,v) for k,v in tok['type']['families'].items()]
css.append(':root {'+' '.join(root)+'}')
tokens_css='\n'.join(css)
bundle_css=open(base+'/components/bundle.css').read()
bundle_js=open(base+'/components/bundle.js').read()
n=0
for c in sorted(os.listdir(base+'/components')):
    p=os.path.join(base,'components',c,'preview.html')
    if not os.path.isfile(p): continue
    src=open(p).read()
    for th in themes:
        head='<style>'+bundle_css+'</style><style>'+tokens_css+'</style><script>'+react+'</script><script>'+rdom+'</script><script>'+bundle_js+'</script>'
        html=src.replace('<head>','<head>'+head,1).replace('<html lang="en">','<html lang="en" data-theme="%s">'%th,1)
        open(os.path.join(OUT,'%s.%s.html'%(c,th)),'w').write(html); n+=1
print(n,'pages')
