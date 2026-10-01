import { deliverReducer, initialDeliverState } from '../slices/deliverSlice';
import { presetFromDeliver, presetsEqual, type SubmitPreset } from '../../services/submit/preset';

const CSE: SubmitPreset = {
  sizeLimitBytes: 2_000_000,
  coverTemplateId: 'assignment',
  footerPreset: 'namePages',
  border: true,
  pageSize: 'Letter',
  layout: 'standard',
  nameTemplate: '{course}_{type}{n}',
};

describe('deliver/APPLY_PRESET', () => {
  it("turns a course's preset into Deliver's options, which read back as that preset", () => {
    const state = deliverReducer(initialDeliverState, { type: 'deliver/APPLY_PRESET', courseId: 'cse', preset: CSE });
    expect(state).toMatchObject({
      presetCourseId: 'cse',
      sizeLimitBytes: 2_000_000,
      pageSize: 'Letter',
      layoutMode: 'standard',
      nameTemplate: '{course}_{type}{n}',
      academicConfig: {
        enableBorder: true,
        footerText: '{name} · {roll} · {X}/{Y}',
        coverPage: { mode: 'template', templateId: 'assignment', values: {} },
      },
    });
    expect(presetsEqual(presetFromDeliver(state, CSE), CSE)).toBe(true);
  });

  it("keeps this document's header and photo cover", () => {
    const withOwn = deliverReducer(initialDeliverState, {
      type: 'deliver/SET_ACADEMIC_CONFIG',
      config: { enableBorder: false, headerText: 'Mine', coverPage: { mode: 'imported_image', importedUri: 'file:///cover.jpg' } },
    });
    const state = deliverReducer(withOwn, { type: 'deliver/APPLY_PRESET', courseId: 'cse', preset: CSE });
    expect(state.academicConfig).toMatchObject({
      headerText: 'Mine',
      footerText: '{name} · {roll} · {X}/{Y}',
      coverPage: { mode: 'imported_image', importedUri: 'file:///cover.jpg' },
    });
    // The course's cover template is kept in what Deliver would remember.
    expect(presetFromDeliver(state, CSE).coverTemplateId).toBe('assignment');
  });

  it('remembers by default, and a reset starts a new session that applies again', () => {
    expect(initialDeliverState.rememberPreset).toBe(true);
    let state = deliverReducer(initialDeliverState, { type: 'deliver/SET_REMEMBER_PRESET', remember: false });
    state = deliverReducer(state, { type: 'deliver/APPLY_PRESET', courseId: 'cse', preset: CSE });
    state = deliverReducer(state, { type: 'deliver/RESET' });
    expect(state.rememberPreset).toBe(true);
    expect(state.presetCourseId).toBeUndefined();
  });

  it('treats an empty course name template as none', () => {
    const state = deliverReducer(initialDeliverState, { type: 'deliver/SET_NAME_TEMPLATE', template: '  ' });
    expect(state.nameTemplate).toBeUndefined();
  });
});
