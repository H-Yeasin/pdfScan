import { deliverReducer, initialDeliverState } from '../slices/deliverSlice';

describe('deliver name', () => {
  it('follows the suggested name until the student types one', () => {
    let state = deliverReducer(initialDeliverState, { type: 'deliver/SET_AUTO_NAME', name: 'CSE101_HW3' });
    state = deliverReducer(state, { type: 'deliver/SET_AUTO_NAME', name: 'CSE101_Lab1' });
    expect(state).toMatchObject({ name: 'CSE101_Lab1', nameEdited: false });

    state = deliverReducer(state, { type: 'deliver/SET_NAME', name: 'My lab' });
    state = deliverReducer(state, { type: 'deliver/SET_AUTO_NAME', name: 'CSE101_Lab2' });
    expect(state).toMatchObject({ name: 'My lab', nameEdited: true });
  });

  it('suggests again after a reset', () => {
    let state = deliverReducer(initialDeliverState, { type: 'deliver/SET_NAME', name: 'My lab' });
    state = deliverReducer(state, { type: 'deliver/RESET' });
    state = deliverReducer(state, { type: 'deliver/SET_AUTO_NAME', name: 'CSE101_HW4' });
    expect(state).toMatchObject({ name: 'CSE101_HW4', nameEdited: false });
  });
});
