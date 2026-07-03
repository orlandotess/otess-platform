with open('app/field/page.js', encoding='utf-8') as f:
    content = f.read()

old = """      {/* FAB */}
      <button style={{ position: 'fixed', bottom: 80, right: 20, width: 52, height: 52, background: showFab ? '#333' : ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,92,42,0.4)', zIndex: 99, fontSize: 24, color: '#fff' }} onClick={() => setShowFab(!showFab)}>
        {showFab ? '✕' : '+'}
      </button>

      {showFab && ("""

new = """      {/* FAB */}
      {tab !== 'clientes' && (
        <button style={{ position: 'fixed', bottom: 80, right: 20, width: 52, height: 52, background: showFab ? '#333' : ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,92,42,0.4)', zIndex: 99, fontSize: 24, color: '#fff' }} onClick={() => setShowFab(!showFab)}>
          {showFab ? '✕' : '+'}
        </button>
      )}

      {showFab && tab !== 'clientes' && ("""

if old not in content:
    print('NO MATCH for FAB block')
else:
    content = content.replace(old, new)
    print('FAB block replaced OK')

with open('app/field/page.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('DONE - file saved')
