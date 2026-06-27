export default class Panel {
  constructor() {
    this.Root = {
      querySelector: () => null,
      setAttribute: () => {}
    };
  }

  onInitialize() {}

  onAttach() {}

  onDetach() {}

  close() {}
}
