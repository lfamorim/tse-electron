// Form filling functions
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkElement() {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Element ${selector} not found after ${timeout}ms`));
        return;
      }
      
      requestAnimationFrame(checkElement);
    }
    
    checkElement();
  });
}

function fillInput(selector, value) {
  return waitForElement(selector).then(el => {
    console.log(`Found element: ${selector}`);
    
    // Focus field
    el.focus();

    // Set value with native setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(el, value);

    // Dispatch events
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // Blur field
    el.blur();
    
    return new Promise(resolve => setTimeout(resolve, 500));
  });
}

// Function to convert date format from YYYY-MM-DD to DD/MM/YYYY
function formatDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : dateStr;
}

console.log(process.argv)

// Get data passed from main process
const localVotacaoArg = process.argv.find(arg => arg.startsWith('--localvotacao='));
const data = localVotacaoArg ? JSON.parse(localVotacaoArg.replace('--localvotacao=', '')) : null;

console.log(data);

// Fill form fields sequentially
Promise.resolve()
  .then(() => fillInput('#titulo-cpf-nome', data.inscricaoNome))
  .then(() => fillInput('input[placeholder="Nome da mãe"]', data.nomeMae))
  .then(() => fillInput('#dataNascimento', formatDate(data.dataNascimento)))
  .then(() => {
    const entrarBtn = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.textContent.includes('Entrar'));

    if (entrarBtn) {
      setTimeout(() => entrarBtn.click(), 500);
    }
  })
  .catch(err => console.error('Error filling form:', err));
