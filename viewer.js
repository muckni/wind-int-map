const triggers = Array.from(document.querySelectorAll('.art-trigger'))
const lightbox = document.getElementById('lightbox')
const lightboxImage = lightbox.querySelector('img')
const titleEl = lightbox.querySelector('.title')
const metaEl = lightbox.querySelector('.meta')
const yearEl = lightbox.querySelector('.year')
const closeBtn = lightbox.querySelector('.lightbox-close')
const prevBtn = lightbox.querySelector('.lightbox-nav.prev')
const nextBtn = lightbox.querySelector('.lightbox-nav.next')

let currentIndex = 0

const updateViewer = (index) => {
  const trigger = triggers[index]
  if (!trigger) return
  const { image, title, medium, year } = trigger.dataset
  lightboxImage.src = image
  lightboxImage.alt = title
  titleEl.textContent = title
  metaEl.textContent = medium
  yearEl.textContent = year
  currentIndex = index
}

const openViewer = (index) => {
  updateViewer(index)
  lightbox.classList.add('active')
  lightbox.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'
}

const closeViewer = () => {
  lightbox.classList.remove('active')
  lightbox.setAttribute('aria-hidden', 'true')
  document.body.style.overflow = ''
}

const showPrev = () => {
  const nextIndex = (currentIndex - 1 + triggers.length) % triggers.length
  updateViewer(nextIndex)
}

const showNext = () => {
  const nextIndex = (currentIndex + 1) % triggers.length
  updateViewer(nextIndex)
}

triggers.forEach((trigger, index) => {
  trigger.addEventListener('click', () => openViewer(index))
})

closeBtn.addEventListener('click', closeViewer)
prevBtn.addEventListener('click', showPrev)
nextBtn.addEventListener('click', showNext)

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) {
    closeViewer()
  }
})

window.addEventListener('keydown', (event) => {
  if (!lightbox.classList.contains('active')) return
  if (event.key === 'Escape') closeViewer()
  if (event.key === 'ArrowLeft') showPrev()
  if (event.key === 'ArrowRight') showNext()
})
