package dev.platform.sample.item;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
class ItemService {
    private final ItemRepository repository;
    private final Clock clock;

    ItemService(ItemRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    ItemResponse create(String name) {
        Item item = new Item(UUID.randomUUID(), name.strip(), Instant.now(clock));
        return ItemResponse.from(repository.save(item));
    }

    @Transactional(readOnly = true)
    List<ItemResponse> findAll(int page, int size) {
        PageRequest request = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        return repository.findAll(request).map(ItemResponse::from).getContent();
    }
}
