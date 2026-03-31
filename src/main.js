/* 
APIOps Cycles Canvas Creator
Creates canvases from json and localization files (note: current code requires the data is directly inserted in the Javascript file.
The JSON files are so big and the client side Javascript not the most efficient way, that also the JSON needs to be minimized with the script).
When you update the Javascript, also create the minimized file and raise version number to help cache to update.
Original author Marjukka Niinioja, licensed under Apache 2.0

 */

const {
  sanitizeInput,
  validateInput,
  distributeMissingPositions,
} = require('./helpers');
const defaultStyles = require('./defaultStyles');

// Base path for images and CSS, updated by initCanvasCreator
let assetBase = '';

// Load canvas layouts and localizations from the data package
const canvasData = require('../node_modules/apiops-cycles-method-data/src/data/canvas/canvasData.json');
const localizedData = require('../node_modules/apiops-cycles-method-data/src/data/canvas/localizedData.json');

  // No DOMPurify setup; sanitization is handled in helpers

  // Sticky note variables
  let currentColor = defaultStyles.stickyNoteColor
  let selectedNote = null
  // Track the currently selected canvas ID
  let canvasId = null
  // Maintain selected locale and canvas for confirmation logic
  let currentLocale = null
let currentCanvas = null
// Track if current canvas has unsaved changes
let unsavedChanges = false
let nextStickyNoteId = 0
let stickyNotesRenderer = () => {}
let footerRenderer = () => {}
let currentSvg = null
let uiBound = false
let pendingStickyNoteId = null
const newStickyNotePrompt = 'Double-click on text to edit. Click and select color '

function ensureStickyNoteIds(sections = []) {
  sections.forEach((section) => {
    if (!section.stickyNotes) return
    section.stickyNotes.forEach((note) => {
      if (!note._noteId) {
        nextStickyNoteId += 1
        note._noteId = `note-${nextStickyNoteId}`
      }
    })
  })
}


function getLocaleKey(locale) {
  if (!locale) return defaultStyles.defaultLocale
  const lower = locale.toLowerCase()
  if (localizedData[lower]) return lower
  const base = lower.split('-')[0]
  return localizedData[base] ? base : lower
}


  
// Function to populate the locale selector
function populateLocaleSelector(localeSelector = document.getElementById('locale')) {
  if (!localeSelector) return
  const locales = Object.keys(localizedData)

  // Add the "Select Locale" option first
  const selectOption = document.createElement('option')
  selectOption.value = ''
  selectOption.text = 'Select Locale'
  localeSelector.add(selectOption)

  // Add locales only once
  locales.forEach((locale) => {
    const option = document.createElement('option')
    option.value = locale
    option.text = locale
    localeSelector.add(option)
  })
}
  
// Function to populate the canvas selector based on the selected locale
function populateCanvasSelector(
  locale,
  canvasSelector = document.getElementById('canvas'),
) {
  if (!canvasSelector) return
  canvasSelector.innerHTML = '' // Clear previous options

  // Add placeholder option so no canvas is auto-selected
  const selectOption = document.createElement('option')
  selectOption.value = ''
  selectOption.text = 'Select Canvas'
  canvasSelector.add(selectOption)

  // Get available canvas IDs from localizedData for the selected locale
  const locKey = getLocaleKey(locale)
  const canvasIds = localizedData[locKey] ? Object.keys(localizedData[locKey]) : []

  canvasIds.forEach((canvasId) => {
    const option = document.createElement('option')
    option.value = canvasId
    // Access the localized title correctly
    option.text = localizedData[locKey][canvasId].title
    canvasSelector.add(option)
  })
}
  
// Initialization function to attach DOM event listeners
function initCanvasCreator({
  localeElement,
  canvasElement,
  canvasSelectorElement,
  canvasCreatorElement,
  toolsSelector = '.canvas-tools',
  assetBase: assetBaseParam = '',
} = {}) {
  // Expose assetBase to other functions
  assetBase = assetBaseParam;
  const localeSel =
    localeElement || document.getElementById('locale')
  const canvasSel =
    canvasElement || document.getElementById('canvas')
  const canvasSelectorContainer =
    canvasSelectorElement || document.getElementById('canvasSelector')
  const canvasCreator =
    canvasCreatorElement || document.getElementById('canvasCreator')
  const exportJSONButton = document.getElementById('exportButton')
  const exportSVGButton = document.getElementById('exportSVGButton')
  const exportPNGButton = document.getElementById('exportPNGButton')
  const importButton = document.getElementById('importButton')
  const metadataButton = document.getElementById('metadataButton')
  const saveMetadataButton = document.getElementById('saveMetadata')
  const metadataForm = document.getElementById('metadataForm')
  const colorSwatches = document.querySelectorAll('.colorSwatch')

  if (!localeSel || !canvasSel) return

  // Event listeners for locale and canvas selection
  localeSel.addEventListener(
    'change',
    (event) => {
      const newLocale = event.target.value

      if (contentData && contentData.sections) {
        const hasStickyNotes = contentData.sections.some(
          (section) => section.stickyNotes.length > 0,
        )
        if (hasStickyNotes) {
          if (
            !confirm(
              'Are you sure you want to remove sticky notes and change canvas?',
            )
          ) {
            localeSel.value = currentLocale || ''
            return
          }
          contentData.sections.forEach((section) => {
            section.stickyNotes = []
          })
        }
      }

      if (canvasSelectorContainer) {
        canvasSelectorContainer.style.display = 'block'
      }

      populateCanvasSelector(newLocale, canvasSel)
      canvasSel.value = ''

      if (canvasCreator) {
        canvasCreator.style.display = 'none'
      }

      currentLocale = newLocale
    },
  )

  // add touch events to tool section
  document.querySelectorAll(toolsSelector).forEach((button) => {
    button.addEventListener(
      'touchstart',
      function (event) {
        event.preventDefault()
        this.click()
      },
      { passive: false },
    )
  })

  canvasSel.addEventListener(
    'change',
    (event) => {
      const newCanvas = event.target.value
      if (!newCanvas) return

      if (contentData && contentData.sections) {
        const hasStickyNotes = contentData.sections.some(
          (section) => section.stickyNotes.length > 0,
        )
        if (hasStickyNotes) {
          if (
            !confirm(
              'Are you sure you want to remove sticky notes and change canvas?',
            )
          ) {
            canvasSel.value = currentCanvas || ''
            return
          }
          contentData.sections.forEach((section) => {
            section.stickyNotes = []
          })
        }
      }

      loadCanvas(localeSel.value, newCanvas)
      if (canvasCreator) {
        canvasCreator.style.display = 'flex'
      }
      currentCanvas = newCanvas
    },
  )

  if (!uiBound) {
    if (importButton) {
      importButton.addEventListener('click', () => {
        fileInput.click()
      })
    }

    if (exportJSONButton) {
      exportJSONButton.addEventListener('click', () => {
        if (!contentData.templateId) return

        const exportData = {
          templateId: contentData.templateId,
          locale: contentData.locale,
          metadata: {
            ...contentData.metadata,
            date: new Date().toISOString(),
          },
          sections: contentData.sections.map((section) => ({
            sectionId: section.sectionId,
            stickyNotes: section.stickyNotes.map((note) => ({
              content: note.content.replace(/\n/g, ''),
              position: note.position,
              size: note.size,
              color: note.color,
            })),
          })),
        }

        const jsonString = JSON.stringify(exportData, null, 2)
        const link = document.createElement('a')
        link.href =
          'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString)
        link.download = `${contentData.metadata.source || 'Canvas'}_${contentData.templateId}_${contentData.locale}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      })
    }

    if (exportSVGButton) {
      exportSVGButton.addEventListener('click', () => {
        if (!currentSvg) return

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(currentSvg)
        const blob = new Blob([svgString], {
          type: 'image/svg+xml;charset=utf-8',
        })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${contentData.metadata.source || 'Canvas'}_${contentData.templateId}_${contentData.locale}.svg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      })
    }

    if (exportPNGButton) {
      exportPNGButton.addEventListener('click', () => {
        if (!currentSvg) return

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(currentSvg)
        const img = new Image()
        img.onload = () => {
          const canvasEl = document.createElement('canvas')
          canvasEl.width = defaultStyles.width + defaultStyles.padding * 2
          canvasEl.height = defaultStyles.height
          const ctx = canvasEl.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const pngUrl = canvasEl.toDataURL('image/png')
          const link = document.createElement('a')
          link.href = pngUrl
          link.download = `${contentData.metadata.source || 'Canvas'}_${contentData.templateId}_${contentData.locale}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
        const svg64 = btoa(unescape(encodeURIComponent(svgString)))
        img.src = 'data:image/svg+xml;base64,' + svg64
      })
    }

    colorSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        currentColor = swatch.dataset.color
        if (selectedNote) {
          selectedNote.color = currentColor
          stickyNotesRenderer()
          selectedNote = null
        }
      })
    })

    if (metadataButton && metadataForm) {
      metadataButton.addEventListener('click', () => {
        metadataForm.style.display = 'block'
      })
    }

    if (saveMetadataButton && metadataForm) {
      saveMetadataButton.addEventListener('click', () => {
        contentData.metadata = {
          source: document.getElementById('source').value,
          license: document.getElementById('license').value,
          authors: document.getElementById('authors').value.split(','),
          website: document.getElementById('website').value,
        }

        metadataForm.style.display = 'none'
        footerRenderer()
      })
    }

    uiBound = true
  }

  // Initialize the locale selector
  populateLocaleSelector(localeSel)

  // Parse locale and canvas from URL parameters securely
  const params = new URLSearchParams(window.location.search)
  let urlLocale = params.get('locale') || ''
  let urlCanvas = params.get('canvas') || ''
  urlLocale = validateInput(sanitizeInput(urlLocale))
  urlCanvas = validateInput(sanitizeInput(urlCanvas))

  if (urlLocale && localizedData[getLocaleKey(urlLocale)]) {
    const normalizedLocale = getLocaleKey(urlLocale)
    localeSel.value = normalizedLocale
    populateCanvasSelector(normalizedLocale, canvasSel)
    if (canvasSelectorContainer) {
      canvasSelectorContainer.style.display = 'block'
    }

    if (
      urlCanvas &&
      localizedData[normalizedLocale] &&
      localizedData[normalizedLocale][urlCanvas]
    ) {
      canvasSel.value = urlCanvas
      loadCanvas(normalizedLocale, urlCanvas)
      if (canvasCreator) {
        canvasCreator.style.display = 'flex'
      }
      currentLocale = normalizedLocale
      currentCanvas = urlCanvas
    }
  }

  // Before unload warning
  window.addEventListener('beforeunload', checkForUnsavedChanges)

  // Focus handling for selectors
  function handleSelectorFocus(event) {
    if (contentData && contentData.sections) {
      const hasStickyNotes = contentData.sections.some(
        (section) => section.stickyNotes.length > 0,
      )
      if (hasStickyNotes) {
        if (
          confirm(
            'Are you sure you want to remove sticky notes and change canvas?',
          )
        ) {
          contentData.sections.forEach((section) => {
            section.stickyNotes = []
          })
          const selectedLocale = localeSel.value
          const selectedCanvas = canvasSel.value
          loadCanvas(selectedLocale, selectedCanvas)
          currentLocale = selectedLocale
          currentCanvas = selectedCanvas
          return false
        } else {
          event.target.blur()
        }
      }
    }
  }

  localeSel.addEventListener('focus', handleSelectorFocus)
  canvasSel.addEventListener('focus', handleSelectorFocus)
}
  
// Create file input once globally
const fileInput = document.createElement("input")
fileInput.type = "file"
fileInput.accept = "application/json"

// Ensure change handler is attached once
fileInput.addEventListener("change", function () {
  const file = fileInput.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = function (event) {
    try {
      const importedData = JSON.parse(event.target.result)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       
      if (
        !importedData.templateId ||
        !importedData.metadata ||
        !importedData.sections
      ) {
        alert("Invalid JSON file format.")
        return
      }
  
      // Save the imported values
      canvasId = importedData.templateId
      contentData = importedData
      ensureStickyNoteIds(contentData.sections)
      canvasDataForId = canvasData[canvasId]

      if (canvasDataForId) {
        // If sticky notes have no coordinates, distribute them evenly
        distributeMissingPositions(contentData, canvasDataForId)
      }
      
      if (!canvasDataForId) {
        alert("Canvas data not found for canvasId: " + canvasId)
        return
      }
      
      // Sync selectors
      const canvasSelector = document.getElementById("canvas")
      const canvasChangeHandler = canvasSelector.onchange
      canvasSelector.onchange = null
      canvasSelector.value = canvasId
      setTimeout(() => {
        canvasSelector.onchange = canvasChangeHandler
      }, 0)
      
      const locale = getLocaleKey(importedData.locale || defaultStyles.defaultLocale)
      document.getElementById("locale").value = locale
      populateCanvasSelector(locale)
      document.getElementById("canvasSelector").style.display = "block"
      document.getElementById("canvasCreator").style.display = "flex"

      // Render canvas
      loadCanvas(locale, canvasId, true)
      currentLocale = locale
      currentCanvas = canvasId
      
      // Mark as dirty
      unsavedChanges = true
      
      alert("Canvas imported successfully.")
      
    } catch (err) {
      alert("Failed to parse JSON: " + err.message)
      console.error(err)
    }
  }
  

  reader.readAsText(file)
  fileInput.value = "" // Reset so same file can be selected again
})

  


  let canvasDataForId = null
  let contentData = {}

  
  function loadCanvas(locale, canvasId, preserveContentData = false) {
    const locKey = getLocaleKey(locale)
    currentLocale = locKey
    currentCanvas = canvasId
    // Access canvasData directly
    canvasDataForId = canvasData[canvasId]
  
    if (!canvasDataForId) {
      console.error(`Canvas data not found for canvasId: ${canvasId}`)
      return
    }
  
    // Only reset contentData if NOT importing
    if (!preserveContentData) {
      contentData = {
        templateId: canvasId,
        locale: locKey,
        metadata: {
          source: "",
          license: "",
          authors: [],
          website: "",
        },
        sections: canvasDataForId.sections
          ? canvasDataForId.sections.map((section) => ({
              sectionId: section.id,
              stickyNotes: [],
            }))
          : [],
      }
    }
    ensureStickyNoteIds(contentData.sections)
  
    const fetchAPIOpsLogo = async (
      url,
      parentGroup,
      x = 0,
      y = 0,
      width = defaultStyles.headerHeight + 2 * defaultStyles.padding,
      height = defaultStyles.headerHeight + 2 * defaultStyles.padding,
    ) => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error("Failed to fetch the logo SVG")
        const svgContent = await response.text()
        parentGroup
          .append("g")
          .attr(
            "transform",
            `translate(${x}, ${y}) scale(${width / 100}, ${height / 100})`,
          ) // Adjust scaling
          .html(svgContent)
      } catch (error) {}
    }
  
    let svg = d3.select("#canvasCreator svg")
    let stickyNotesLayer = null
  
    //main
    const renderCanvas = (canvasData, contentData, localizedData) => {
      d3.select("#canvasCreator svg").remove()
  
      const cellWidth = Math.floor(
        (defaultStyles.width -
          canvasData.layout.columns * defaultStyles.padding) /
          canvasData.layout.columns,
      )
  
      const cellHeight = Math.floor(
        (defaultStyles.height -
          defaultStyles.headerHeight -
          defaultStyles.footerHeight -
          4 * defaultStyles.padding) /
          canvasData.layout.rows,
      )
  
      const locale = getLocaleKey(contentData.locale || defaultStyles.defaultLocale)
      // Use canvasId to access the correct localized data
      const canvasId = contentData.templateId
      const localizedCanvasData = localizedData[locale] ? localizedData[locale][canvasId] : null
  
      // Check if contentData is empty
      if (Object.keys(contentData).length === 0) {
        // Create a new contentData structure based on canvasData
        contentData.templateId = canvasData.id
        contentData.locale = locale // Or any default locale you prefer
        contentData.metadata = {
          source: "",
          license: "",
          authors: [],
          website: "",
        }
        contentData.sections = canvasData.sections.map((section) => ({
          sectionId: section.id,
          stickyNotes: [], // Empty array for sticky notes
        }))
      }
  
      svg = d3
        .select("#canvasCreator")
        .append("svg")
        .attr("width", defaultStyles.width + defaultStyles.padding * 2)
        .attr("height", defaultStyles.height)
        .style("background-color", defaultStyles.backgroundColor)
      currentSvg = svg.node()
  
      const logoUrl = `${assetBase}/img/apiops-cycles-logo2025-blue.svg`
  
      fetchAPIOpsLogo(
        logoUrl,
        svg,
        defaultStyles.padding,
        defaultStyles.padding / 2,
        defaultStyles.padding,
        defaultStyles.padding,
      )
  
      svg
        .append("text")
        .attr("x", defaultStyles.headerHeight + 2 * defaultStyles.padding)
        .attr("y", 2 * defaultStyles.padding + defaultStyles.fontSize)
        .attr("text-anchor", "start")
        .attr("font-family", defaultStyles.fontFamily)
        .attr("font-size", defaultStyles.fontSize + 4 + "px")
        .attr("font-weight", "bold")
        .attr("fill", defaultStyles.fontColor)
        .text(localizedCanvasData.title)
  
      svg
        .append("text")
        .attr("x", defaultStyles.headerHeight + 2 * defaultStyles.padding)
        .attr("y", defaultStyles.headerHeight - 3 * defaultStyles.padding)
        .attr("text-anchor", "start")
        .attr("font-family", defaultStyles.fontFamily)
        .attr("font-size", defaultStyles.fontSize + 2 + "px")
        .attr("fill", defaultStyles.fontColor)
        .text(localizedCanvasData.purpose)
  
      svg
        .append("text")
        .attr("x", defaultStyles.headerHeight + 2 * defaultStyles.padding)
        .attr("y", defaultStyles.headerHeight - defaultStyles.padding)
        .attr("text-anchor", "start")
        .attr("font-family", defaultStyles.fontFamily)
        .attr("font-size", defaultStyles.fontSize + 2 + "px")
        .attr("fill", defaultStyles.fontColor)
        .text(localizedCanvasData.howToUse)
  
      svg
        .append("text")
        .attr("x", defaultStyles.width / 2)
        .attr("y", defaultStyles.height - defaultStyles.footerHeight)
        .attr("text-anchor", "middle")
        .attr("font-family", defaultStyles.fontFamily)
        .attr("font-size", defaultStyles.fontSize)
        .attr("fill", defaultStyles.fontColor)
        .html(
          `Template by: ${canvasData.metadata.source} | ${canvasData.metadata.license} | ${canvasData.metadata.authors} | <a href='https://${canvasData.metadata.website}' target='_blank'>${canvasData.metadata.website}</a>`
        )
  
      canvasData.sections.forEach((block, index) => {
        const sectionId = block.id
        const localizedSection = localizedCanvasData.sections[sectionId]
  
        const x =
          block.gridPosition.column * cellWidth + 2 * defaultStyles.padding
        const y = block.gridPosition.row * cellHeight + defaultStyles.headerHeight
        const width = block.gridPosition.colSpan * cellWidth
        const height = block.gridPosition.rowSpan * cellHeight
        const style = { ...defaultStyles, ...block.style }
  
        svg
          .append("rect")
          .attr("x", x)
          .attr("y", y)
          .attr("width", width)
          .attr("height", height)
          .attr("fill", style.sectionColor)
          .attr("stroke", style.borderColor)
          .attr("rx", style.cornerRadius)
          .attr("ry", style.cornerRadius)
          .attr("stroke-width", style.lineSize)
  
        if (block.highlight) {
          svg
            .append("rect")
            .attr("x", x)
            .attr("y", y)
            .attr("width", width)
            .attr("height", height)
            .attr("fill", style.highlightColor)
            .attr("stroke", style.borderColor)
            .attr("rx", style.cornerRadius)
            .attr("ry", style.cornerRadius)
            .attr("stroke-width", 2 * style.lineSize)
        }
  
        if (block.journeySteps) {
          const steps = ["", "", "", "", ""]
          const stepCount = steps.length
          const stepWidth = Math.max(
            width / stepCount - 2 * style.padding,
            style.stickyNoteSize,
          )
          const stepHeight = style.stickyNoteSize
          const arrowPadding = 0 // Space between the arrow and the box
  
          // Add a marker definition for arrowheads
          const defs = svg.append("defs")
          defs
            .append("marker")
            .attr("id", "arrowhead")
            .attr("markerWidth", 4)
            .attr("markerHeight", 7)
            .attr("refX", 5)
            .attr("refY", 3.5)
            .attr("orient", "auto")
            .append("polygon")
            .attr("points", "0 0, 5 3.5, 0 7")
            .attr("fill", style.borderColor)
  
          steps.forEach((step, i) => {
            const stepX = x + i * (stepWidth + 2 * style.stickyNoteSpacing)
            const stepCenterX = stepX + stepWidth / 2
            const stepCenterY = y + style.stickyNoteSize
  
            svg
              .append("rect")
              .attr("x", stepX)
              .attr(
                "y",
                y + style.stickyNoteSize / 2 + 2 * style.stickyNoteSpacing,
              )
              .attr("width", stepWidth)
              .attr("height", stepHeight)
              .attr("fill", "#fff")
              .attr("stroke", style.borderColor)
              .attr("stroke-width", style.lineSize)
              .attr("stroke-dasharray", 3 * style.lineSize)
              .attr("rx", style.cornerRadius / 2)
              .attr("ry", style.cornerRadius / 2)
  
            // Draw the arrow to the next step (if not the last step)
            if (i < steps.length - 1) {
              const nextStepX = stepX + stepWidth + 2 * style.stickyNoteSpacing
              const nextStepCenterX = nextStepX + stepWidth / 2
  
              svg
                .append("line")
                .attr("x1", stepCenterX + stepWidth / 2 + arrowPadding)
                .attr("y1", stepCenterY)
                .attr("x2", nextStepCenterX - stepWidth / 2 - arrowPadding)
                .attr("y2", stepCenterY)
                .attr("stroke", style.borderColor)
                .attr("stroke-width", 2 * style.lineSize)
                .attr("marker-end", "url(#arrowhead)")
            }
          })
        }
  
        // adding numbered circles to sections to indicate fill order
  
        svg
          .append("circle")
          .attr("cx", x + style.padding)
          .attr("cy", y + style.padding)
          .attr("r", style.circleRadius)
          .attr("fill", style.borderColor)
  
        svg
          .append("text")
          .attr("x", x + style.padding)
          .attr("y", y + style.padding + 5)
          .attr("text-anchor", "middle")
          .attr("font-family", style.fontFamily)
          .attr("font-size", style.fontSize + "px")
          .attr("fill", style.fontColor)
          .attr("fill", style.highlightColor)
          .text(block.fillOrder)
  
        svg
          .append("text")
          .attr("x", x + style.padding + style.circleRadius)
          .attr("y", y + style.padding + style.circleRadius)
          .attr("font-family", style.fontFamily)
          .attr("font-size", style.fontSize + "px")
          .attr("font-weight", "bold")
          .attr("fill", style.fontColor)
          .text(localizedSection.section)
  
        // split localized help texts i.e. descriptions to lines to fit to sections
  
        const description = localizedSection.description
  
        const descWords = description.split(" ")
        let descLine = ""
        let descLineNumber = 0
        const lineHeight = style.fontSize + 2
        const maxWidth = width - style.padding * 2
  
        const descGroup = svg.append("g")
        descWords.forEach((word) => {
          const testLine = descLine + word + " "
          const testText = descGroup
            .append("text")
            .attr("font-family", style.fontFamily)
            .attr("font-size", style.fontSize + "px")
            .attr("fill", style.fontColor)
            .attr("x", x + style.padding)
            .attr(
              "y",
              y +
                style.padding +
                style.circleRadius +
                2 * style.padding +
                descLineNumber * lineHeight,
            )
            .text(testLine)
  
          if (testText.node().getComputedTextLength() > maxWidth) {
            testText.remove()
            svg
              .append("text")
              .attr("x", x + style.padding)
              .attr(
                "y",
                y +
                  style.padding +
                  style.circleRadius +
                  2 * style.padding +
                  descLineNumber * lineHeight,
              )
              .attr("font-family", defaultStyles.fontFamily)
              .attr("font-size", style.fontSize + "px")
              .attr("fill", style.fontColor)
              .text(descLine)
            descLine = word + " "
            descLineNumber++
          } else {
            testText.remove()
            descLine = testLine
          }
        })
  
        svg
          .append("text")
          .attr("x", x + style.padding)
          .attr(
            "y",
            y +
              style.padding +
              style.circleRadius +
              2 * style.padding +
              descLineNumber * lineHeight,
          )
          .attr("font-family", style.fontFamily)
          .attr("font-size", style.fontSize + "px")
          .attr("fill", style.fontColor)
          .text(descLine)
      })
  
      const defs = svg.append("defs")
      const filter = defs.append("filter").attr("id", "shadow")
  
      filter
        .append("feDropShadow")
        .attr("dx", 3)
        .attr("dy", 3)
        .attr("stdDeviation", 2)
        .attr("flood-color", defaultStyles.shadowColor)
  
      // Function to update the footer text
      function updateFooter() {
        // Remove existing footer
        svg.selectAll("text.footer").remove()
  
        // Add content footer
        svg
          .append("text")
          .attr("class", "footer")
          .attr("x", defaultStyles.width / 2)
          .attr(
            "y",
            defaultStyles.height -
              defaultStyles.footerHeight -
              2 * defaultStyles.padding,
          )
          .attr("text-anchor", "middle")
          .attr("font-family", defaultStyles.fontFamily)
          .attr("font-size", defaultStyles.fontSize)
          .attr("fill", defaultStyles.fontColor)
          .html(
            `Content by: ${contentData?.metadata?.source} | ${contentData?.metadata?.license} | ${contentData?.metadata?.authors} | <a href='https://${contentData?.metadata?.website}' target='_blank'>${contentData?.metadata?.website}</a>`
          )
      }
  
      function getEventCoordinates(event) {
        let x, y
        const svgRect = svg.node().getBoundingClientRect()
  
        if (event.type.startsWith("touch")) {
          const touch = event.changedTouches[0]
          x = touch.clientX - svgRect.left
          y = touch.clientY - svgRect.top
        } else {
          x = event.clientX - svgRect.left
          y = event.clientY - svgRect.top
        }
  
        return { x, y }
      }
  
      let lastTapTime = 0
      let lastClickTime = 0
  
      // Attach event listener to the entire SVG
      svg.on("click touchend", function (event) {
        event.preventDefault() // Prevent scrolling on mobile devices
  
        // Get correct event coordinates
        const { x, y } = getEventCoordinates(event)
  
        const now = new Date().getTime()
        const isTouch = event.type === "touchend"
  
        // Handle mouse double-click separately
        if (!isTouch) {
          if (now - lastClickTime < 300) {
            handleCreateStickyNote(event, "mouse")
          }
          lastClickTime = now
        }
        // Handle double-tap for touch
        else {
          if (now - lastTapTime < 300) {
            handleCreateStickyNote(event, "touch")
          }
          lastTapTime = now
        }
      })
  
      // Function to create a sticky note
      function handleCreateStickyNote(event, inputType) {
        let x, y
  
        if (inputType === "mouse") {
          x = event.offsetX - defaultStyles.stickyNoteSize / 2
          y = event.offsetY - defaultStyles.stickyNoteSize / 2
        } else if (inputType === "touch") {
          const touch = event.changedTouches[0]
  
          // Convert touch coordinates from viewport to SVG coordinates
          const svgRect = svg.node().getBoundingClientRect()
          x = touch.clientX - svgRect.left - defaultStyles.stickyNoteSize / 2
          y = touch.clientY - svgRect.top - defaultStyles.stickyNoteSize / 2
        }
  
        // Find the section that was clicked
        const clickedSection = canvasData.sections.find((section) => {
          const sectionRect = {
            x:
              section.gridPosition.column * cellWidth + 2 * defaultStyles.padding,
            y: section.gridPosition.row * cellHeight + defaultStyles.headerHeight,
            width: section.gridPosition.colSpan * cellWidth,
            height: section.gridPosition.rowSpan * cellHeight,
          }
          return isPointInRect(
            x + defaultStyles.stickyNoteSize / 2,
            y + defaultStyles.stickyNoteSize / 2,
            sectionRect,
          )
        })
  
        if (clickedSection) {
          const contentSection = contentData.sections.find(
            (section) => section.sectionId === clickedSection.id,
          )
          const stickyNote = {
            content: sanitizeInput(newStickyNotePrompt),
            position: { x, y },
            size: defaultStyles.stickyNoteSize,
            color: currentColor,
            isNew: true,
          }
          nextStickyNoteId += 1
          stickyNote._noteId = `note-${nextStickyNoteId}`
          contentSection.stickyNotes.push(stickyNote)
          pendingStickyNoteId = stickyNote._noteId
          updateStickyNotes(contentData)
        }
      }
  
      // Call updateStickyNotes to display initial sticky notes
      stickyNotesLayer = svg.append('g').attr('class', 'sticky-notes-layer')
      footerRenderer = updateFooter
      stickyNotesRenderer = () => updateStickyNotes(contentData)
      updateStickyNotes(contentData)
    }
  
    const updateStickyNotes = (contentData) => {
      if (!contentData || !contentData.sections || !stickyNotesLayer) {
        return
      }

      function openStickyNoteEditor(note, noteGroup) {
        const parentG = noteGroup || d3.select(`#sticky-note-${note._noteId}`)
        if (parentG.select('foreignObject').size()) return

        parentG.select('text').style('visibility', 'hidden')

        const inputField = parentG
          .append('foreignObject')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', defaultStyles.stickyNoteSize)
          .attr('height', defaultStyles.stickyNoteSize)
          .append('xhtml:textarea')
          .attr('value', note.content)
          .style('font-family', defaultStyles.fontFamily)
          .style('font-size', defaultStyles.fontSize + 'px')
          .style('width', 'calc(100% + 0px)')
          .style('height', 'calc(100% + 0px)')
          .style('border', 'none')
          .style('padding', '5px')
          .style('resize', 'none')

        setTimeout(() => {
          inputField.node().focus()
        }, 0)

        inputField
          .on('focus', function () {
            this.value = note.isNew
              ? ''
              : note.content.replace(/\n{2,}/g, '\n')
          })
          .on('blur', function () {
            let newContent = this.value

            newContent = sanitizeInput(newContent)
            newContent = validateInput(newContent)

            note.content = wrapText(svg, newContent)
            note.isNew = false
            d3.select(this.parentNode).remove()
            updateStickyNotes(contentData)
          })
      }

      ensureStickyNoteIds(contentData.sections)

      const notes = contentData.sections.flatMap((contentSection) =>
        (contentSection.stickyNotes || []).map((note) => {
          note.sectionId = contentSection.sectionId
          return note
        }),
      )

      const stickyNotes = stickyNotesLayer
        .selectAll('.sticky-note')
        .data(notes, (d) => d._noteId)

      stickyNotes.exit().remove()

      const stickyNotesEnter = stickyNotes
        .enter()
        .append('g')
        .attr('class', (d) => `sticky-note sticky-note-${d.sectionId}`)
        .attr('id', (d) => `sticky-note-${d._noteId}`)

      stickyNotesEnter
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', defaultStyles.stickyNoteSize)
        .attr('height', defaultStyles.stickyNoteSize)
        .attr('rx', 3)
        .attr('ry', 3)

      stickyNotesEnter
        .append('text')
        .attr('x', 5)
        .attr('y', 15)
        .attr('font-family', defaultStyles.fontFamily)
        .attr('font-size', defaultStyles.fontSize + 'px')
        .attr('fill', defaultStyles.contentFontColor)
        .on('dblclick touchend', function (event, d) {
          event.stopPropagation()
          event.preventDefault()
          openStickyNoteEditor(d, d3.select(this.parentNode))
        })

      const mergedStickyNotes = stickyNotesEnter.merge(stickyNotes)

      mergedStickyNotes
        .attr('class', (d) => `sticky-note sticky-note-${d.sectionId}`)
        .attr(
          'transform',
          (d) => `translate(${d.position.x || 0},${d.position.y || 0})`,
        )
        .on('click touchstart', function (event, d) {
          event.stopPropagation()
          event.preventDefault()
          if (d.isNew) {
            openStickyNoteEditor(d, d3.select(this))
            return
          }
          selectedNote = d
        })

      mergedStickyNotes
        .select('rect')
        .attr('fill', (d) => d.color || defaultStyles.stickyNoteColor)
        .attr('stroke', (d) => d.color || defaultStyles.stickyNoteBorderColor)

      mergedStickyNotes
        .select('text')
        .style('visibility', null)
        .each(function (d) {
          const textSelection = d3.select(this)
          d.content = wrapText(svg, d.content)
          const lines = d.content.split('\n')

          textSelection.selectAll('tspan').remove()
          lines.forEach((line, index) => {
            textSelection
              .append('tspan')
              .attr('x', 5)
              .attr('dy', index === 0 ? 0 : 14)
              .text(line)
          })
        })

      mergedStickyNotes.selectAll('foreignObject').remove()

      if (pendingStickyNoteId) {
        const pendingNote = notes.find((note) => note._noteId === pendingStickyNoteId)
        if (pendingNote) {
          openStickyNoteEditor(pendingNote)
        }
        pendingStickyNoteId = null
      }

      stickyNotesLayer.selectAll('.sticky-note').call(
        d3
          .drag()
          .on('start', function (event, d) {
            d3.select(this).attr('originalPosition', {
              x: d.position.x,
              y: d.position.y,
            })
          })
          .on('drag', function (event, d) {
            d.position.x = event.x
            d.position.y = event.y
            d3.select(this).attr(
              'transform',
              `translate(${d.position.x},${d.position.y})`,
            )
          })
          .on('end', function () {
            // Keep the last drag position without forcing a full redraw.
          }),
      )
  
      //right click on mouse or long press on touch open alert to remove sticky note
      svg.on("contextmenu", function (event) {
        event.preventDefault() // Prevent default right-click menu
  
        // Get mouse coordinates relative to the SVG
        const x = event.offsetX
        const y = event.offsetY
  
        // Find the sticky note that was clicked
        let clickedNote = null
        for (let i = 0; i < contentData.sections.length; i++) {
          const section = contentData.sections[i]
          for (let j = 0; j < section.stickyNotes.length; j++) {
            const note = section.stickyNotes[j]
            if (
              x >= note.position.x &&
              x <= note.position.x + defaultStyles.stickyNoteSize &&
              y >= note.position.y &&
              y <= note.position.y + defaultStyles.stickyNoteSize
            ) {
              clickedNote = note
              break
            }
          }
          if (clickedNote) {
            break
          }
        }
  
        if (clickedNote) {
          if (confirm("Are you sure you want to delete this sticky note?")) {
            // Remove the sticky note from the data
            const section = contentData.sections.find((section) =>
              section.stickyNotes.includes(clickedNote),
            )
            section.stickyNotes = section.stickyNotes.filter(
              (note) => note !== clickedNote,
            )
  
            // Update the sticky notes on the canvas
            updateStickyNotes(contentData)
          }
        }
      })
    }
  
    function wrapText(svg, text) {
      // Normalize the text first to have only single newlines
      const normalizedText = text.replace(/\n{2,}/g, "\n")
      const words = normalizedText.split(" ")
      let line = ""
      const contentLines = []
  
      words.forEach((word) => {
        const testLine = line + word + " "
        const tempText = svg
          .append("text")
          .attr("font-family", defaultStyles.fontFamily)
          .attr("font-size", defaultStyles.fontSize + "px")
          .text(testLine)
  
        const testLineWidth = tempText.node().getComputedTextLength()
        tempText.remove()
  
        if (testLineWidth > defaultStyles.maxLineWidth) {
          contentLines.push(line)
          line = word + " "
        } else {
          line = testLine
        }
      })
  
      contentLines.push(line)
      return contentLines.join("\n")
    }
  
    // Function to check if a point is inside a rectangle
    function isPointInRect(x, y, rect) {
      return (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      )
    }
  
    // Render the canvas
    renderCanvas(canvasDataForId, contentData, localizedData)
  }
  
  let hasStickyNotes = false

  // Function to check for unsaved changes and show confirmation dialog
  function checkForUnsavedChanges(event) {
    if (contentData && contentData.sections) {
      hasStickyNotes = contentData.sections.some(
        (section) => section.stickyNotes.length > 0,
      )

      if (hasStickyNotes) {
        const message =
          "You have unsaved changes. Are you sure you want to leave this page?"
        event.preventDefault()
        event.returnValue = message
        return message // Return the message for other use cases
      }
    }
  }

module.exports = { loadCanvas, initCanvasCreator }
