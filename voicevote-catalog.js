/*
 * VoiceVote dependent dropdowns.
 * Works in plain HTML/JavaScript on GitHub Pages.
 * The grade, section and project field names stay compatible with VoiceVote_Code.gs.
 */
(function (global) {
  'use strict';

  function unique(values) {
    return Array.from(new Set(values)).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function resetSelect(select, prompt, options) {
    select.replaceChildren();
    select.add(new Option(prompt, ''));
    options.forEach(function (value) {
      select.add(new Option(value, value));
    });
    select.disabled = options.length === 0;
    select.value = '';
  }

  function init(config) {
    const grade = document.querySelector(config.gradeSelector || '#studentClass');
    const section = document.querySelector(config.sectionSelector || '#section');
    const project = document.querySelector(config.projectSelector || '#project');
    const status = config.statusSelector ? document.querySelector(config.statusSelector) : null;
    if (!grade || !section || !project) {
      throw new Error('Class/Grade, Section, or Project dropdown was not found.');
    }
    const preserveExistingGrades = config.preserveExistingGrades !== false;
    const existingGradeValues = Array.from(grade.options)
      .map(function (option) { return option.value.trim(); })
      .filter(Boolean);
    let catalog = [];

    function setStatus(message) {
      if (status) status.textContent = message;
    }

    function updateProjects() {
      const options = unique(catalog.filter(function (entry) {
        return entry.grade === grade.value && entry.section === section.value;
      }).map(function (entry) { return entry.project; }));
      resetSelect(project, options.length ? 'Select science fair project' : 'No projects for this selection', options);
      setStatus(section.value ? (options.length + ' project(s) available') : 'Select a section to view projects.');
    }

    function updateSections() {
      const options = unique(catalog.filter(function (entry) {
        return entry.grade === grade.value;
      }).map(function (entry) { return entry.section; }));
      resetSelect(section, options.length ? 'Select section' : 'No sections for this grade', options);
      updateProjects();
      if (!grade.value) setStatus('Select a class/grade to begin.');
      else if (!options.length) setStatus('No active projects for this class/grade.');
    }

    function setCatalog(entries) {
      if (!Array.isArray(entries)) throw new Error('Project catalog must be an array.');
      catalog = entries.filter(function (entry) {
        return entry && typeof entry.grade === 'string' && entry.grade.trim() &&
          typeof entry.section === 'string' && entry.section.trim() &&
          typeof entry.project === 'string' && entry.project.trim();
      }).map(function (entry) {
        return { grade: entry.grade.trim(), section: entry.section.trim(), project: entry.project.trim() };
      });

      const grades = (preserveExistingGrades && existingGradeValues.length)
        ? existingGradeValues : unique(catalog.map(function (entry) { return entry.grade; }));
      resetSelect(grade, 'Select class/grade', grades);
      updateSections();
      if (catalog.length === 0) setStatus('No active projects are listed yet.');
    }

    function loadCatalog(apiUrl) {
      return new Promise(function (resolve, reject) {
        if (!/^https:\/\//i.test(apiUrl)) {
          reject(new Error('Use your HTTPS Google Apps Script /exec URL.'));
          return;
        }
        const name = 'voiceVoteCatalog' + Date.now() + Math.floor(Math.random() * 100000);
        const script = document.createElement('script');
        let finished = false;
        const timeout = setTimeout(function () {
          finish(new Error('Project list request timed out.'));
        }, 15000);
        function finish(error, data) {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          delete global[name];
          script.remove();
          if (error) reject(error);
          else resolve(data);
        }
        global[name] = function (payload) {
          if (!payload || !payload.success || !Array.isArray(payload.projects)) {
            finish(new Error((payload && payload.message) || 'Could not load the project list.'));
          } else {
            finish(null, payload.projects);
          }
        };
        script.onerror = function () { finish(new Error('Unable to reach Google Apps Script.')); };
        const separator = apiUrl.includes('?') ? '&' : '?';
        script.src = apiUrl + separator + 'action=catalog&callback=' + encodeURIComponent(name);
        document.head.appendChild(script);
      });
    }

    grade.addEventListener('change', updateSections);
    section.addEventListener('change', updateProjects);
    resetSelect(section, 'Select class/grade first', []);
    resetSelect(project, 'Select class/grade and section first', []);
    setStatus('Loading projects…');

    if (config.catalog) {
      setCatalog(config.catalog);
      return Promise.resolve({ setCatalog: setCatalog, loadCatalog: loadCatalog });
    }
    if (!config.apiUrl) {
      setStatus('Missing Apps Script URL.');
      return Promise.reject(new Error('Pass apiUrl or catalog to VoiceVoteCatalogSelector.init.'));
    }
    return loadCatalog(config.apiUrl).then(function (entries) {
      setCatalog(entries);
      return { setCatalog: setCatalog, loadCatalog: loadCatalog };
    }).catch(function (error) {
      setStatus(error.message + ' Please retry.');
      throw error;
    });
  }

  global.VoiceVoteCatalogSelector = { init: init };
})(window);
