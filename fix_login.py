code = open('app/login/page.js').read()
print('has onSubmit:', 'onSubmit' in code)
print('has handleLogin:', 'handleLogin' in code)
