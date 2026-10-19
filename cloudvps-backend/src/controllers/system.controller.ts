import { capacityService } from "../services/capacity.service";

export const systemController = {
  async getCapacity({ set }: any) {
    try {
      const data = await capacityService.getNodeSnapshot();
      return { success: true, data };
    } catch {
      set.status = 503;
      return { success: false, message: "Proxmox node unreachable or not configured." };
    }
  },
};
