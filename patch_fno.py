content = open('routes/purchase-orders.js').read()

content = content.replace("const FILE_NO_PREFIXES = ['33', '73', '74', '75'];", "const FILE_NO_PREFIXES = ['19', '33', '74', '75'];")

content = content.replace('<option value="33">33</option>\n                  <option value="73">73</option>\n                  <option value="74">74</option>\n                  <option value="75">75</option>', '<option value="19">19 - DE/IT</option>\n                  <option value="33">33 - DE/IT 2</option>\n                  <option value="74">74 - DE/Basis</option>\n                  <option value="75">75 - DE/IT 2</option>')

content = content.replace('<label>F.NO</label>\n                <select name="file_no_prefix"', '<label>F.NO <span class="req">*</span></label>\n                <select name="file_no_prefix" required id="addFnoSelect"', 1)

content = content.replace('onclick="document.getElementById(\'addForm\').submit()">\n              <i class="ti ti-device-floppy"></i> Save entry', 'onclick="var sel=document.getElementById(\'addFnoSelect\');if(!sel.value){sel.focus();alert(\'Please select an F.NO before saving.\');return;}document.getElementById(\'addForm\').submit();">\n              <i class="ti ti-device-floppy"></i> Save entry')

open('routes/purchase-orders.js', 'w').write(content)
print('Done!')
