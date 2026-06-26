old = 'sb_publishable_wL7A9THCYwVcyu3t6uk-3Q_Vt09bJzn'
new = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppc2lkb3J3ZGhydHRtZHBwbmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzA3NDEsImV4cCI6MjA5ODAwNjc0MX0.dKCf0omLnIy3AILNaU8vWj_yrMlJM-Fh9sOui71a7Po'
with open('app/login/page.js','r') as f: content=f.read()
content=content.replace(old,new)
with open('app/login/page.js','w') as f: f.write(content)
print('done')
