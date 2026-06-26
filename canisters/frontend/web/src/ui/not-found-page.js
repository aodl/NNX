export function renderNotFoundPage(root, { missingNeuron = false } = {}) {
  root.innerHTML = '';
  const shell = document.createElement('section');
  shell.className = 'notice';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Network Nexus';

  const title = document.createElement('h1');
  title.textContent = missingNeuron ? 'Neuron not found' : 'Page not found';

  const message = document.createElement('p');
  message.textContent = missingNeuron ? 'No NNS neuron was found for this ID.' : 'Use /neuron/{neuron_id}.';

  shell.append(eyebrow, title, message);
  root.className = 'shell';
  root.append(shell);
}
