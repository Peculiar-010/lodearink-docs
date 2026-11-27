// In the PRIVATE API project only. Adapt filenames to the existing source.
import existingWorker from './existing-worker.mjs';
import {withObservability} from './observability/adapter.mjs';
// scheduled(), queue(), other module handlers and fetch's response object are retained.
export default withObservability(existingWorker);
